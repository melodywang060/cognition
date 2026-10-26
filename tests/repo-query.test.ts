import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { repo } from "@/lib/repo";
import { setupFixtures, users, widgets } from "./fixtures";

let mine: string;
let theirs: string;

beforeAll(async () => {
  await setupFixtures();
  const data = { amount_cents: 1, secret_note: "top secret" };
  mine = (await repo.mutate(users.agent, widgets, { kind: "create", data: { ...data, name: "mine" } })).id;
  theirs = (await repo.mutate(users.agent2, widgets, { kind: "create", data: { ...data, name: "theirs" } })).id;
});
afterAll(() => prisma.$disconnect());

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("repo.query row filters and field masks", () => {
  it("hides other people's rows from an agent", async () => {
    const rows = await repo.query(users.agent, widgets, { limit: 1000 });
    expect(ids(rows)).toContain(mine);
    expect(ids(rows)).not.toContain(theirs);
    expect(await repo.get(users.agent, widgets, theirs)).toBeNull();
  });

  it("does not let an explicit where clause escape the row filter", async () => {
    expect(await repo.query(users.agent, widgets, { where: { requester_id: users.agent2.id } })).toEqual([]);
  });

  it("shows all rows to a reviewer", async () => {
    const rows = await repo.query(users.reviewer, widgets, { limit: 1000 });
    expect(ids(rows)).toEqual(expect.arrayContaining([mine, theirs]));
  });

  it("masks fields from roles below the field's readRole", async () => {
    const forReviewer = await repo.get(users.reviewer, widgets, mine);
    const forAdmin = await repo.get(users.admin, widgets, mine);
    expect(forReviewer).not.toHaveProperty("secret_note");
    expect(forReviewer).toMatchObject({ name: "mine" });
    expect(forAdmin).toMatchObject({ secret_note: "top secret" });
  });

  it("masks fields on rows returned from mutate too", async () => {
    const row = await repo.mutate(users.agent, widgets, {
      kind: "create",
      data: { name: "n", amount_cents: 1, secret_note: "s" },
    });
    expect(row).not.toHaveProperty("secret_note");
  });

  it("refuses to filter, sort or search on a masked field", async () => {
    await expect(repo.query(users.reviewer, widgets, { where: { secret_note: "top secret" } })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      repo.query(users.reviewer, widgets, { orderBy: { field: "secret_note", dir: "asc" } }),
    ).rejects.toMatchObject({ status: 400 });
    expect(ids(await repo.query(users.reviewer, widgets, { search: "top secret" }))).not.toContain(mine);
    expect(ids(await repo.query(users.admin, widgets, { search: "top secret" }))).toContain(mine);
  });

  it("applies the row filter to mutations: a row you cannot see is not found", async () => {
    const agentsMayUpdate = { ...widgets, permissions: { ...widgets.permissions, update: "agent" as const } };
    await expect(
      repo.mutate(users.agent, agentsMayUpdate, { kind: "update", id: theirs, data: { name: "x" } }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      repo.mutate(users.agent, agentsMayUpdate, { kind: "update", id: mine, data: { name: "y" } }),
    ).resolves.toMatchObject({ name: "y" });
  });
});
