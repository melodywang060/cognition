import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as collection from "@/app/api/apps/[app]/[resource]/route";
import * as item from "@/app/api/apps/[app]/[resource]/[id]/route";
import * as approvals from "@/app/api/apps/[app]/[resource]/[id]/approvals/route";
import * as transitions from "@/app/api/apps/[app]/[resource]/[id]/transitions/[name]/route";
import { prisma } from "@/lib/db";
import { auditRows, params, request, setupFixtures, users } from "./fixtures";

const base = "/api/apps/test/widgets";
const res = { app: "test", resource: "widgets" };

async function createWidget(amount = 500) {
  const r = await collection.POST(request("POST", base, users.agent, { name: "w", amount_cents: amount }), params(res));
  expect(r.status).toBe(201);
  return (await r.json()).row.id as string;
}

beforeAll(setupFixtures);
afterAll(() => prisma.$disconnect());

describe("server-side role checks on mutating routes", () => {
  it("returns 401 without a user", async () => {
    const r = await collection.POST(request("POST", base, undefined, { name: "w", amount_cents: 1 }), params(res));
    expect(r.status).toBe(401);
  });

  it("returns 403 when an agent updates (update requires admin) and changes nothing", async () => {
    const id = await createWidget();
    const r = await item.PATCH(request("PATCH", `${base}/${id}`, users.agent, { name: "hacked" }), params({ ...res, id }));
    expect(r.status).toBe(403);
    const row = await prisma.$queryRaw<{ name: string }[]>`SELECT name FROM test_widgets WHERE id = ${id}`;
    expect(row[0].name).toBe("w");
    expect((await auditRows(id)).map((a) => a.action)).toEqual(["create"]);
  });

  it("returns 403 when an agent approves", async () => {
    const id = await createWidget();
    const r = await approvals.POST(
      request("POST", `${base}/${id}/approvals`, users.agent2, { decision: "approve" }),
      params({ ...res, id }),
    );
    expect(r.status).toBe(403);
  });

  it("returns 403 when a reviewer applies an admin-only transition", async () => {
    const id = await createWidget();
    const r = await transitions.POST(
      request("POST", `${base}/${id}/transitions/archive`, users.reviewer),
      params({ ...res, id, name: "archive" }),
    );
    expect(r.status).toBe(403);
  });

  it("rejects writes to workflow-managed fields through the API", async () => {
    const r = await collection.POST(
      request("POST", base, users.admin, { name: "w", amount_cents: 1, status: "approved" }),
      params(res),
    );
    expect(r.status).toBe(400);
  });

  it("allows an admin to update and audits it", async () => {
    const id = await createWidget();
    const r = await item.PATCH(request("PATCH", `${base}/${id}`, users.admin, { name: "renamed" }), params({ ...res, id }));
    expect(r.status).toBe(200);
    expect((await auditRows(id)).map((a) => a.action)).toEqual(["create", "update"]);
  });
});
