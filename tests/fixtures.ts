import { prisma } from "@/lib/db";
import { registerApp } from "@/lib/registry";
import type { User } from "@/lib/roles";
import type { AppConfig, ResourceConfig } from "@/lib/types";

/** Test-only resource: exercises row filters, field masks, an approval rule and a transition. */
export const widgets: ResourceConfig = {
  id: "widgets",
  label: "Widgets",
  singular: "Widget",
  table: "test_widgets",
  fields: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "amount_cents", label: "Amount", type: "money", required: true },
    { name: "status", label: "Status", type: "enum", options: ["requested", "approved", "denied", "archived"] },
    { name: "requester_id", label: "Requester", type: "user" },
    { name: "secret_note", label: "Secret note", type: "text", readRole: "admin" },
  ],
  list: { columns: ["name", "amount_cents", "status"], search: ["name", "secret_note"] },
  form: { fields: ["name", "amount_cents", "secret_note"] },
  permissions: { read: "agent", create: "agent", update: "admin", delete: "admin" },
  // Agents only see their own requests.
  rowFilter: (user) => (user.role === "agent" ? { requester_id: user.id } : undefined),
  statusField: "status",
  approval: {
    approverRole: "reviewer",
    requesterField: "requester_id",
    amountField: "amount_cents",
    threshold: 100_000,
    states: { pending: "requested", approved: "approved", denied: "denied" },
  },
  transitions: { archive: { label: "Archive", role: "admin", from: ["approved", "denied"], to: "archived" } },
};

export const testApp: AppConfig = { id: "test", name: "Test app", description: "Test only", resources: [widgets] };

export const users = {
  agent: { id: "t-agent", name: "Test Agent", email: "t-agent@test", role: "agent" },
  agent2: { id: "t-agent2", name: "Test Agent 2", email: "t-agent2@test", role: "agent" },
  reviewer: { id: "t-reviewer", name: "Test Reviewer", email: "t-reviewer@test", role: "reviewer" },
  reviewer2: { id: "t-reviewer2", name: "Test Reviewer 2", email: "t-reviewer2@test", role: "reviewer" },
  admin: { id: "t-admin", name: "Test Admin", email: "t-admin@test", role: "admin" },
  admin2: { id: "t-admin2", name: "Test Admin 2", email: "t-admin2@test", role: "admin" },
} satisfies Record<string, User>;

export async function setupFixtures() {
  registerApp(testApp);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS test_widgets (
      id text PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now(),
      name text NOT NULL,
      amount_cents int NOT NULL,
      status text NOT NULL,
      requester_id text,
      secret_note text
    )`);
  for (const u of Object.values(users)) {
    await prisma.user.upsert({ where: { id: u.id }, update: u, create: u });
  }
}

export function auditRows(recordId: string) {
  return prisma.auditEvent.findMany({ where: { recordId }, orderBy: { createdAt: "asc" } });
}

export function request(method: string, path: string, user?: User, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (user) headers.cookie = `uid=${user.id}`;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const params = <T>(p: T) => ({ params: Promise.resolve(p) });
