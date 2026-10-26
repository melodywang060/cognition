import type { Role } from "@prisma/client";
import { seedRefunds } from "../src/apps/refunds/seed";
import { prisma } from "../src/lib/db";

/** One user per role, plus a second reviewer so two-approver rules can be exercised. */
const users: { id: string; name: string; email: string; role: Role }[] = [
  { id: "u-agent", name: "Alice Agent", email: "alice@example.com", role: "agent" },
  { id: "u-reviewer", name: "Rita Reviewer", email: "rita@example.com", role: "reviewer" },
  { id: "u-reviewer2", name: "Rob Reviewer", email: "rob@example.com", role: "reviewer" },
  { id: "u-admin", name: "Adam Admin", email: "adam@example.com", role: "admin" },
];

async function main() {
  for (const u of users) {
    await prisma.user.upsert({ where: { id: u.id }, update: u, create: u });
  }
  // App seed data is added per app, through the foundation so it is audited.
  const steps = await seedRefunds(users);
  if (steps) console.log(`Refunds seed: applied ${steps} step(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
