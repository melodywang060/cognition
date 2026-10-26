import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as collection from "@/app/api/apps/[app]/[resource]/route";
import * as item from "@/app/api/apps/[app]/[resource]/[id]/route";
import * as changes from "@/app/api/apps/[app]/[resource]/[id]/changes/[changeId]/approvals/route";
import { featureFlags } from "@/apps/feature-flags/config";
import { SEED, seedFeatureFlags } from "@/apps/feature-flags/seed";
import { listChangeRequests } from "@/lib/change-requests";
import { prisma } from "@/lib/db";
import { repo } from "@/lib/repo";
import type { User } from "@/lib/roles";
import { recordHistory } from "@/lib/screens/history";
import { auditRows, params, request, setupFixtures, users } from "./fixtures";

const base = "/api/apps/feature-flags/flags";
const res = { app: "feature-flags", resource: "flags" };
type Flag = { id: string; name: string; environment: string; enabled: boolean; rollout_pct: number };
type Env = "dev" | "staging" | "prod";

const create = (by: User, environment: Env, name = `flag-${randomUUID().slice(0, 8)}`) =>
  collection.POST(request("POST", base, by, { name, description: "test", environment }), params(res));

async function newFlag(environment: Env, by: User = environment === "prod" ? users.admin : users.agent): Promise<Flag> {
  const r = await create(by, environment);
  expect(r.status).toBe(201);
  return (await r.json()).row;
}

const patch = (id: string, by: User, body: Record<string, unknown>) =>
  item.PATCH(request("PATCH", `${base}/${id}`, by, body), params({ ...res, id }));

const decide = (id: string, changeId: string, by: User, decision: "approve" | "deny", reason?: string) =>
  changes.POST(
    request("POST", `${base}/${id}/changes/${changeId}/approvals`, by, { decision, reason }),
    params({ ...res, id, changeId }),
  );

const get = async (id: string) => (await repo.get(users.admin, featureFlags, id)) as unknown as Flag;

async function requestProdChange(flag: Flag, by: User = users.admin, body: Record<string, unknown> = { enabled: true, rollout_pct: 50 }) {
  const r = await patch(flag.id, by, body);
  expect(r.status).toBe(202);
  return (await r.json()).changeRequest as { id: string; status: string; requester_id: string };
}

/** Audit rows of a flag's change requests and of their approval decisions. */
async function changeAuditRows(flagId: string) {
  const crs = await prisma.changeRequest.findMany({ where: { recordId: flagId } });
  const approvals = await prisma.approval.findMany({ where: { resourceKey: "change_requests", recordId: { in: crs.map((c) => c.id) } } });
  return prisma.auditEvent.findMany({
    where: { recordId: { in: [...crs.map((c) => c.id), ...approvals.map((a) => a.id)] } },
    orderBy: { createdAt: "asc" },
  });
}

beforeAll(setupFixtures);
afterAll(() => prisma.$disconnect());

describe("feature flags: dev and staging", () => {
  it("creates a flag off at 0% with an audit row", async () => {
    const flag = await newFlag("dev");
    expect(flag).toMatchObject({ enabled: false, rollout_pct: 0 });
    expect((await auditRows(flag.id)).map((a) => [a.action, a.actorId])).toEqual([["create", users.agent.id]]);
  });

  it.each(["dev", "staging"] as const)("lets an engineer toggle in %s directly, with an audit row", async (env) => {
    const flag = await newFlag(env);
    const r = await patch(flag.id, users.agent, { enabled: true, rollout_pct: 30 });
    expect(r.status).toBe(200);
    expect(await get(flag.id)).toMatchObject({ enabled: true, rollout_pct: 30 });
    const rows = await auditRows(flag.id);
    expect(rows.map((a) => [a.action, a.actorId])).toEqual([
      ["create", users.agent.id],
      ["update", users.agent.id],
    ]);
    expect(rows[1].before).toMatchObject({ enabled: false, rollout_pct: 0 });
    expect(rows[1].after).toMatchObject({ enabled: true, rollout_pct: 30 });
  });

  it("rejects a rollout outside 0-100 and fields not on the edit form", async () => {
    const flag = await newFlag("dev");
    expect((await patch(flag.id, users.agent, { rollout_pct: 101 })).status).toBe(400);
    expect((await patch(flag.id, users.agent, { environment: "prod" })).status).toBe(400);
    expect(await get(flag.id)).toMatchObject({ environment: "dev", rollout_pct: 0 });
  });

  it("returns 409 for a duplicate name in the same environment", async () => {
    const name = `dup-${randomUUID().slice(0, 8)}`;
    expect((await create(users.agent, "dev", name)).status).toBe(201);
    expect((await create(users.agent, "dev", name)).status).toBe(409);
    expect((await create(users.agent, "staging", name)).status).toBe(201);
  });
});

describe("feature flags: prod needs two admins", () => {
  it("returns 403 when an engineer creates a prod flag", async () => {
    expect((await create(users.agent, "prod")).status).toBe(403);
  });

  it("returns 403 when an engineer or reviewer toggles in prod, and holds nothing", async () => {
    const flag = await newFlag("prod");
    for (const who of [users.agent, users.reviewer]) {
      expect((await patch(flag.id, who, { enabled: true })).status).toBe(403);
    }
    expect(await get(flag.id)).toMatchObject({ enabled: false });
    expect(await listChangeRequests(users.admin, featureFlags, flag.id)).toHaveLength(0);
  });

  it("holds an admin's prod toggle as a change request without changing the flag", async () => {
    const flag = await newFlag("prod");
    const cr = await requestProdChange(flag);
    expect(cr).toMatchObject({ status: "requested", requester_id: users.admin.id });
    expect(await get(flag.id)).toMatchObject({ enabled: false, rollout_pct: 0 });
  });

  it("refuses a gated change made directly through repo.mutate", async () => {
    const flag = await newFlag("dev");
    // Moving a flag into prod is gated too (the rule matches the row after the change).
    await expect(
      repo.mutate(users.admin, featureFlags, { kind: "update", id: flag.id, data: { environment: "prod" } }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await get(flag.id)).toMatchObject({ environment: "dev" });
  });

  it("returns 403 when the requesting admin approves their own change", async () => {
    const flag = await newFlag("prod");
    const cr = await requestProdChange(flag);
    expect((await decide(flag.id, cr.id, users.admin, "approve")).status).toBe(403);
    expect(await get(flag.id)).toMatchObject({ enabled: false });
  });

  it("returns 403 when a non-admin approves", async () => {
    const flag = await newFlag("prod");
    const cr = await requestProdChange(flag);
    for (const who of [users.agent, users.reviewer]) {
      expect((await decide(flag.id, cr.id, who, "approve")).status).toBe(403);
    }
    expect(await get(flag.id)).toMatchObject({ enabled: false });
  });

  it("applies the change when a second, different admin approves, with audit rows", async () => {
    const flag = await newFlag("prod");
    const cr = await requestProdChange(flag);
    const r = await decide(flag.id, cr.id, users.admin2, "approve");
    expect(await r.json()).toEqual({ status: "applied", approvals: 1, required: 1 });
    expect(await get(flag.id)).toMatchObject({ enabled: true, rollout_pct: 50 });

    const own = await auditRows(flag.id);
    expect(own.map((a) => [a.action, a.actorId])).toEqual([
      ["create", users.admin.id],
      ["update", users.admin2.id],
    ]);
    expect(own[1].after).toMatchObject({ enabled: true, rollout_pct: 50 });
    expect((await changeAuditRows(flag.id)).map((a) => [a.tableName, a.action, a.actorId])).toEqual([
      ["change_requests", "create", users.admin.id],
      ["approvals", "create", users.admin2.id],
      ["change_requests", "approve", users.admin2.id],
    ]);
    // Decided requests can't be decided again.
    expect((await decide(flag.id, cr.id, users.admin2, "approve")).status).toBe(409);
  });

  it("leaves the flag unchanged on deny, which needs a reason and is audited", async () => {
    const flag = await newFlag("prod");
    const cr = await requestProdChange(flag);
    expect((await decide(flag.id, cr.id, users.admin2, "deny")).status).toBe(400);
    expect((await decide(flag.id, cr.id, users.admin2, "deny", "Not during the freeze")).status).toBe(200);
    expect(await get(flag.id)).toMatchObject({ enabled: false });
    expect((await auditRows(flag.id)).map((a) => a.action)).toEqual(["create"]);
    const rows = await changeAuditRows(flag.id);
    expect(rows.map((a) => [a.tableName, a.action])).toEqual([
      ["change_requests", "create"],
      ["approvals", "create"],
      ["change_requests", "deny"],
    ]);
    expect(rows[1].after).toMatchObject({ decision: "deny", reason: "Not during the freeze" });
  });

  it("allows one open change request per flag", async () => {
    const flag = await newFlag("prod");
    await requestProdChange(flag);
    expect((await patch(flag.id, users.admin2, { enabled: true })).status).toBe(409);
  });

  it("returns 404 for a change request of another flag", async () => {
    const [a, b] = [await newFlag("prod"), await newFlag("prod")];
    const cr = await requestProdChange(a);
    expect((await decide(b.id, cr.id, users.admin2, "approve")).status).toBe(404);
    expect(await get(a.id)).toMatchObject({ enabled: false });
  });

  it("refuses to apply a change if the flag changed since the request", async () => {
    const flag = await newFlag("prod");
    const cr = await requestProdChange(flag);
    await prisma.featureFlag.update({ where: { id: flag.id }, data: { rolloutPct: 5 } });
    expect((await decide(flag.id, cr.id, users.admin2, "approve")).status).toBe(409);
    expect(await get(flag.id)).toMatchObject({ enabled: false, rollout_pct: 5 });
    expect((await listChangeRequests(users.admin, featureFlags, flag.id))[0].status).toBe("requested");
  });

  it("shows the change requests and decisions in the flag's history, visible to engineers", async () => {
    const flag = await newFlag("prod");
    const cr = await requestProdChange(flag);
    await decide(flag.id, cr.id, users.admin2, "approve");
    const crs = await listChangeRequests(users.agent, featureFlags, flag.id);
    const approvals = await prisma.approval.findMany({ where: { recordId: cr.id } });
    const history = await recordHistory(users.agent, featureFlags, flag.id, approvals, crs);
    expect(history.map((h) => [h.table_name, h.action])).toEqual([
      ["feature_flags", "create"],
      ["change_requests", "create"],
      ["approvals", "create"],
      ["change_requests", "approve"],
      ["feature_flags", "update"],
    ]);
  });
});

describe("feature flags seed", () => {
  const seedUsers = [users.agent, users.reviewer, users.admin, users.admin2];

  it("covers every environment and prod outcome", () => {
    expect(new Set(SEED.map((s) => s[2]))).toEqual(new Set(["dev", "staging", "prod"]));
    expect(new Set(SEED.map((s) => s[5]).filter(Boolean))).toEqual(new Set(["applied", "pending", "denied"]));
  });

  it("seeds through the foundation and is a no-op on the second run", async () => {
    const run = randomUUID().slice(0, 8);
    const samples = SEED.map(([name, ...rest]) => [`${name}-${run}`, ...rest] as typeof SEED[number]);
    expect(await seedFeatureFlags(seedUsers, samples)).toBeGreaterThan(0);
    const audits = await prisma.auditEvent.count();
    expect(await seedFeatureFlags(seedUsers, samples)).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(audits);

    for (const [name, , environment, enabled, rollout_pct, outcome] of samples) {
      const [row] = await repo.query(users.admin, featureFlags, { where: { name, environment } });
      const expected = outcome === "pending" || outcome === "denied" ? { enabled: false, rollout_pct: 0 } : { enabled, rollout_pct };
      expect(row).toMatchObject(expected);
      if (environment === "prod" && rollout_pct > 0) {
        const status = { applied: "applied", pending: "requested", denied: "denied" }[outcome!];
        expect((await listChangeRequests(users.admin, featureFlags, row.id)).map((c) => c.status)).toEqual([status]);
      }
    }
  });
});
