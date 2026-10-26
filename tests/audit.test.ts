import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { repo } from "@/lib/repo";
import type { User } from "@/lib/roles";
import { auditResource } from "@/lib/system-resources";
import { auditRows, setupFixtures, users, widgets } from "./fixtures";

beforeAll(setupFixtures);
afterAll(() => prisma.$disconnect());

describe("audit log", () => {
  it("writes an audit row with actor, before and after for every mutation", async () => {
    const created = await repo.mutate(users.admin, widgets, { kind: "create", data: { name: "a", amount_cents: 1 } });
    await repo.mutate(users.admin, widgets, { kind: "update", id: created.id, data: { name: "b" } });
    await repo.mutate(users.admin, widgets, { kind: "delete", id: created.id });

    const rows = await auditRows(created.id);
    expect(rows.map((r) => [r.action, r.actorId, r.tableName])).toEqual([
      ["create", users.admin.id, "test_widgets"],
      ["update", users.admin.id, "test_widgets"],
      ["delete", users.admin.id, "test_widgets"],
    ]);
    expect(rows[0].before).toBeNull();
    expect(rows[1].before).toMatchObject({ name: "a" });
    expect(rows[1].after).toMatchObject({ name: "b" });
    expect(rows[2].after).toBeNull();
  });

  it("rolls back the mutation when the audit write fails", async () => {
    // Not in the users table, so the audit row's actor foreign key fails after the insert succeeds.
    const ghost: User = { id: "ghost", name: "Ghost", email: "ghost@test", role: "admin" };
    const before = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM test_widgets`;
    await expect(
      repo.mutate(ghost, widgets, { kind: "create", data: { name: "ghost", amount_cents: 1 } }),
    ).rejects.toThrow();
    const after = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM test_widgets`;
    expect(after[0].n).toBe(before[0].n);
    expect(await prisma.auditEvent.count({ where: { actorId: "ghost" } })).toBe(0);
  });

  it("is append-only at the database level", async () => {
    const row = await repo.mutate(users.admin, widgets, { kind: "create", data: { name: "x", amount_cents: 1 } });
    const [event] = await auditRows(row.id);
    await expect(prisma.auditEvent.update({ where: { id: event.id }, data: { action: "x" } })).rejects.toThrow();
    await expect(prisma.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow();
  });

  it("is readable by reviewers and admins only, and writable by no one", async () => {
    await expect(repo.query(users.agent, auditResource)).rejects.toMatchObject({ status: 403 });
    await expect(repo.query(users.reviewer, auditResource, { limit: 1 })).resolves.toBeInstanceOf(Array);
    await expect(
      repo.mutate(users.admin, auditResource, { kind: "create", data: { action: "fake" } }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("applies the audited resource's field masks to before/after", async () => {
    const row = await repo.mutate(users.admin, widgets, {
      kind: "create",
      data: { name: "m", amount_cents: 1, secret_note: "classified" },
    });
    const where = { record_id: row.id };
    const [forReviewer] = await repo.query(users.reviewer, auditResource, { where });
    const [forAdmin] = await repo.query(users.admin, auditResource, { where });
    expect(forReviewer.after).not.toHaveProperty("secret_note");
    expect(forAdmin.after).toMatchObject({ secret_note: "classified" });
  });
});
