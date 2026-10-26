import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as collection from "@/app/api/apps/[app]/[resource]/route";
import * as approvals from "@/app/api/apps/[app]/[resource]/[id]/approvals/route";
import * as transitions from "@/app/api/apps/[app]/[resource]/[id]/transitions/[name]/route";
import { approvalThreshold, refunds } from "@/apps/refunds/config";
import { prisma } from "@/lib/db";
import { repo } from "@/lib/repo";
import type { User } from "@/lib/roles";
import { auditRows, params, request, setupFixtures, users } from "./fixtures";

const base = "/api/apps/refunds/refunds";
const res = { app: "refunds", resource: "refunds" };

async function requestRefund(by: User, amount_cents = 2_500) {
  const r = await collection.POST(
    request("POST", base, by, { customer: "Test Customer", order_id: "ORD-T1", amount_cents, reason_code: "goodwill" }),
    params(res),
  );
  expect(r.status).toBe(201);
  return (await r.json()).row as { id: string; status: string; requester_id: string };
}

const decide = (id: string, by: User, decision: "approve" | "deny", reason?: string) =>
  approvals.POST(request("POST", `${base}/${id}/approvals`, by, { decision, reason }), params({ ...res, id }));

const issue = (id: string, by: User) =>
  transitions.POST(request("POST", `${base}/${id}/transitions/issue`, by), params({ ...res, id, name: "issue" }));

const status = async (id: string) => (await repo.get(users.admin, refunds, id))?.status;

/** Audit rows for the approval decisions recorded against a refund. */
async function approvalAuditRows(refundId: string) {
  const ids = (await prisma.approval.findMany({ where: { resourceKey: "refunds", recordId: refundId } })).map((a) => a.id);
  return prisma.auditEvent.findMany({ where: { tableName: "approvals", recordId: { in: ids } }, orderBy: { createdAt: "asc" } });
}

beforeAll(setupFixtures);
afterAll(() => prisma.$disconnect());

describe("refunds app", () => {
  it("declares a $1,000 approval threshold in config", () => {
    expect(approvalThreshold).toBe(100_000);
    expect(refunds.approval?.threshold).toBe(approvalThreshold);
  });

  it("creates a refund in requested with the caller as requester", async () => {
    const row = await requestRefund(users.agent);
    expect(row.status).toBe("requested");
    expect(row.requester_id).toBe(users.agent.id);
  });

  it("returns 403 when an agent approves", async () => {
    const { id } = await requestRefund(users.agent);
    const r = await decide(id, users.agent2, "approve");
    expect(r.status).toBe(403);
    expect(await status(id)).toBe("requested");
  });

  it("returns 403 when the requester approves their own refund", async () => {
    const { id } = await requestRefund(users.reviewer);
    expect((await decide(id, users.reviewer, "approve")).status).toBe(403);
    expect(await status(id)).toBe("requested");
    expect(await approvalAuditRows(id)).toHaveLength(0);
  });

  it("approves a refund at the threshold with one approver", async () => {
    const { id } = await requestRefund(users.agent, approvalThreshold);
    const r = await decide(id, users.reviewer, "approve");
    expect(await r.json()).toEqual({ status: "approved", approvals: 1, required: 1 });
  });

  it("needs two distinct approvers above the threshold", async () => {
    const { id } = await requestRefund(users.agent, approvalThreshold + 1);

    expect(await (await decide(id, users.reviewer, "approve")).json()).toEqual({ status: "requested", approvals: 1, required: 2 });
    expect(await status(id)).toBe("requested");

    expect((await decide(id, users.reviewer, "approve")).status).toBe(409);
    expect(await status(id)).toBe("requested");

    expect(await (await decide(id, users.reviewer2, "approve")).json()).toEqual({ status: "approved", approvals: 2, required: 2 });
    expect(await status(id)).toBe("approved");
  });

  it("returns 403 when a reviewer issues (admin only)", async () => {
    const { id } = await requestRefund(users.agent);
    await decide(id, users.reviewer, "approve");
    expect((await issue(id, users.reviewer)).status).toBe(403);
    expect(await status(id)).toBe("approved");
  });

  it("writes an audit row for request, approve and issue", async () => {
    const { id } = await requestRefund(users.agent);
    expect((await decide(id, users.reviewer, "approve")).status).toBe(200);
    expect((await issue(id, users.admin)).status).toBe(200);

    const rows = await auditRows(id);
    expect(rows.map((a) => [a.action, a.actorId])).toEqual([
      ["create", users.agent.id],
      ["approve", users.reviewer.id],
      ["issue", users.admin.id],
    ]);
    expect(rows[0].after).toMatchObject({ status: "requested", requester_id: users.agent.id });
    expect(rows[1].before).toMatchObject({ status: "requested" });
    expect(rows[1].after).toMatchObject({ status: "approved" });
    expect(rows[2].after).toMatchObject({ status: "issued" });
    expect((await approvalAuditRows(id)).map((a) => a.after)).toEqual([
      expect.objectContaining({ approver_id: users.reviewer.id, decision: "approve" }),
    ]);
  });

  it("writes an audit row for deny, with the reason", async () => {
    const { id } = await requestRefund(users.agent);
    expect((await decide(id, users.reviewer, "deny", "Outside policy")).status).toBe(200);

    expect((await auditRows(id)).map((a) => [a.action, a.actorId])).toEqual([
      ["create", users.agent.id],
      ["deny", users.reviewer.id],
    ]);
    expect((await approvalAuditRows(id)).map((a) => a.after)).toEqual([
      expect.objectContaining({ decision: "deny", reason: "Outside policy" }),
    ]);
  });

  it("audits the first of two approvals even though the status doesn't change", async () => {
    const { id } = await requestRefund(users.agent, approvalThreshold + 1);
    await decide(id, users.reviewer, "approve");
    expect((await auditRows(id)).map((a) => a.action)).toEqual(["create"]);
    expect(await approvalAuditRows(id)).toHaveLength(1);
  });
});
