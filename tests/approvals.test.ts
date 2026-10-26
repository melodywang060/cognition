import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as approvalsRoute from "@/app/api/apps/[app]/[resource]/[id]/approvals/route";
import { decide } from "@/lib/approvals";
import { prisma } from "@/lib/db";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";
import { repo } from "@/lib/repo";
import type { User } from "@/lib/roles";
import { applyTransition } from "@/lib/transitions";
import { auditRows, params, request, setupFixtures, users, widgets } from "./fixtures";

beforeAll(setupFixtures);
afterAll(() => prisma.$disconnect());

const create = async (amount: number, by: User = users.reviewer) =>
  (await repo.mutate(by, widgets, { kind: "create", data: { name: "w", amount_cents: amount } })).id;

const status = async (id: string) => (await repo.get(users.admin, widgets, id))?.status;

describe("maker-checker approvals", () => {
  it("sets requester and pending status on create, from the server", async () => {
    const row = await repo.mutate(users.agent, widgets, { kind: "create", data: { name: "w", amount_cents: 1 } });
    expect(row.requester_id).toBe(users.agent.id);
    expect(row.status).toBe("requested");
  });

  it("forbids the requester from approving their own request (403 from the route)", async () => {
    const id = await create(500, users.reviewer);
    const r = await approvalsRoute.POST(
      request("POST", `/api/apps/test/widgets/${id}/approvals`, users.reviewer, { decision: "approve" }),
      params({ app: "test", resource: "widgets", id }),
    );
    expect(r.status).toBe(403);
    await expect(decide(users.reviewer, widgets, id, "deny", "no")).rejects.toBeInstanceOf(ForbiddenError);
    expect(await status(id)).toBe("requested");
  });

  it("approves an under-threshold request with one approver", async () => {
    const id = await create(100_000);
    expect(await decide(users.reviewer2, widgets, id, "approve")).toEqual({ status: "approved", approvals: 1, required: 1 });
    expect(await status(id)).toBe("approved");
  });

  it("requires two distinct approvers above the threshold", async () => {
    const id = await create(100_001, users.agent);
    expect(await decide(users.reviewer, widgets, id, "approve")).toEqual({ status: "requested", approvals: 1, required: 2 });
    expect(await status(id)).toBe("requested");

    await expect(decide(users.reviewer, widgets, id, "approve")).rejects.toBeInstanceOf(ConflictError);
    expect(await status(id)).toBe("requested");

    expect(await decide(users.reviewer2, widgets, id, "approve")).toEqual({ status: "approved", approvals: 2, required: 2 });
    expect(await status(id)).toBe("approved");
    expect((await auditRows(id)).map((a) => a.action)).toEqual(["create", "approve"]);
  });

  it("denies with a reason, and rejects decisions on closed requests", async () => {
    const id = await create(500, users.agent);
    await expect(decide(users.reviewer, widgets, id, "deny")).rejects.toBeInstanceOf(ValidationError);
    expect((await decide(users.reviewer, widgets, id, "deny", "duplicate")).status).toBe("denied");
    await expect(decide(users.admin, widgets, id, "approve")).rejects.toBeInstanceOf(ConflictError);
  });

  it("applies a declared transition only from allowed states", async () => {
    const id = await create(500, users.agent);
    await expect(applyTransition(users.admin, widgets, id, "archive")).rejects.toBeInstanceOf(ConflictError);
    await decide(users.reviewer, widgets, id, "approve");
    expect((await applyTransition(users.admin, widgets, id, "archive")).status).toBe("archived");
  });
});
