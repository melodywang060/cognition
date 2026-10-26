import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approvalThreshold, refunds } from "@/apps/refunds/config";
import { SEED, seedRefunds, type Outcome, type SeedRefund } from "@/apps/refunds/seed";
import { decide, listApprovals } from "@/lib/approvals";
import { prisma } from "@/lib/db";
import { repo } from "@/lib/repo";
import { setupFixtures, users } from "./fixtures";

const seedUsers = [users.agent, users.reviewer, users.reviewer2, users.admin];
const expected: Record<Outcome, string> = {
  requested: "requested",
  one_approval: "requested",
  approved: "approved",
  denied: "denied",
  issued: "issued",
};

const byOrder = (order_id: string) => repo.query(users.admin, refunds, { where: { order_id } });
const auditCount = () => prisma.auditEvent.count();

beforeAll(setupFixtures);
afterAll(() => prisma.$disconnect());

describe("refunds seed", () => {
  it("covers every status with at least two refunds over the threshold", () => {
    const statuses = new Set(SEED.map((s) => expected[s[6]]));
    expect([...statuses].sort()).toEqual(["approved", "denied", "issued", "requested"]);
    expect(SEED.filter((s) => s[2] > approvalThreshold).length).toBeGreaterThanOrEqual(2);
    expect(new Set(SEED.map((s) => s[1])).size).toBe(SEED.length);
  });

  it("completes an interrupted seed on the next run, then is a no-op", async () => {
    const run = randomUUID().slice(0, 8);
    const samples: SeedRefund[] = [
      ["Big Co", `T-${run}-1`, approvalThreshold + 1, "goodwill", null, "agent", "issued"],
      ["Pending Co", `T-${run}-2`, approvalThreshold + 1, "goodwill", null, "agent", "one_approval"],
      ["Denied Co", `T-${run}-3`, 500, "goodwill", null, "agent", "denied"],
    ];
    // Interrupted after the first sample's create and first of two approvals.
    const first = await repo.mutate(users.agent, refunds, {
      kind: "create",
      data: { customer: "Big Co", order_id: samples[0][1], amount_cents: samples[0][2], reason_code: "goodwill" },
    });
    await decide(users.reviewer, refunds, first.id, "approve");

    // Second approval + issue, then create + approve, then create + deny.
    expect(await seedRefunds(seedUsers, samples)).toBe(6);
    for (const [, order_id, , , , , outcome] of samples) {
      const rows = await byOrder(order_id);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe(expected[outcome]);
    }
    const approvers = (await listApprovals(users.admin, refunds, first.id)).map((a) => a.approver_id);
    expect(approvers).toEqual([users.reviewer.id, users.reviewer2.id]);
    expect(await listApprovals(users.admin, refunds, (await byOrder(samples[1][1]))[0].id)).toHaveLength(1);

    const audits = await auditCount();
    expect(await seedRefunds(seedUsers, samples)).toBe(0);
    expect(await auditCount()).toBe(audits);
  });

  it("seeds every sample exactly once at its target status", async () => {
    await seedRefunds(seedUsers);
    expect(await seedRefunds(seedUsers)).toBe(0);
    for (const [, order_id, , , , , outcome] of SEED) {
      const rows = await byOrder(order_id);
      expect(rows.map((r) => r.status)).toEqual([expected[outcome]]);
    }
  });
});
