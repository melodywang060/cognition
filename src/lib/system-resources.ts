import { findResourceByTable } from "./registry";
import { hasRole } from "./roles";
import type { ResourceConfig, Row } from "./types";

function maskSnapshot(snapshot: unknown, resource: ResourceConfig | undefined, role: Parameters<typeof hasRole>[0]) {
  if (!resource || !snapshot || typeof snapshot !== "object") return snapshot;
  const copy = { ...(snapshot as Record<string, unknown>) };
  for (const f of resource.fields) {
    if (f.readRole && !hasRole(role, f.readRole)) delete copy[f.name];
  }
  return copy;
}

/** Read-only for everyone: no create/update/delete permission, and a DB trigger blocks UPDATE/DELETE. */
export const auditResource: ResourceConfig = {
  id: "audit",
  label: "Audit log",
  singular: "Audit event",
  table: "audit_events",
  fields: [
    { name: "actor_id", label: "Actor", type: "user" },
    { name: "action", label: "Action", type: "text" },
    { name: "table_name", label: "Table", type: "text" },
    { name: "record_id", label: "Record", type: "text" },
    { name: "before", label: "Before", type: "json" },
    { name: "after", label: "After", type: "json" },
  ],
  list: {
    columns: ["created_at", "actor_id", "action", "table_name", "record_id", "before", "after"],
    filters: [
      { field: "record_id", kind: "text" },
      { field: "actor_id", kind: "select" },
      { field: "table_name", kind: "text" },
    ],
    sort: { field: "created_at", dir: "desc" },
  },
  permissions: { read: "reviewer" },
  // Field masks of the audited resource also apply to its before/after snapshots.
  transformRow: (row: Row, user) => {
    const resource = findResourceByTable(String(row.table_name));
    return { ...row, before: maskSnapshot(row.before, resource, user.role), after: maskSnapshot(row.after, resource, user.role) };
  },
};

/** Written only by `approvals.decide()`, which enforces the maker-checker rules first. */
export const approvalsResource: ResourceConfig = {
  id: "approvals",
  label: "Approvals",
  singular: "Approval",
  table: "approvals",
  fields: [
    { name: "resource_key", label: "Resource", type: "text", required: true },
    { name: "record_id", label: "Record", type: "text", required: true },
    { name: "approver_id", label: "Approver", type: "user", required: true },
    { name: "decision", label: "Decision", type: "enum", options: ["approve", "deny"], required: true },
    { name: "reason", label: "Reason", type: "text" },
  ],
  list: { columns: ["created_at", "approver_id", "decision", "reason"], sort: { field: "created_at", dir: "asc" } },
  permissions: { read: "agent", create: "reviewer" },
};
