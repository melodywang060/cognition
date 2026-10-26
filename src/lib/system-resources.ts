import { findResourceByTable } from "./registry";
import { hasRole } from "./roles";
import type { ResourceConfig, Row } from "./types";

export function maskSnapshot(snapshot: unknown, resource: ResourceConfig | undefined, role: Parameters<typeof hasRole>[0]) {
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
    const mask = (snapshot: unknown) =>
      row.table_name === CHANGE_REQUESTS ? maskChangeRequest(snapshot, user.role) : maskSnapshot(snapshot, resource, user.role);
    return { ...row, before: mask(row.before), after: mask(row.after) };
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

const CHANGE_REQUESTS = "change_requests";
export const CHANGE_STATES = { pending: "requested", approved: "applied", denied: "denied" } as const;

/** A change request's proposed data and before snapshot get the target resource's field masks. */
function maskChangeRequest(snapshot: unknown, role: Parameters<typeof hasRole>[0]) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const cr = snapshot as Record<string, unknown>;
  const target = findResourceByTable(String(cr.resource_key));
  return { ...cr, data: maskSnapshot(cr.data, target, role), before: maskSnapshot(cr.before, target, role) };
}

/**
 * Change requests for one resource with a `changeApproval` rule. Written only by `change-requests.ts`
 * (requests) and `approvals.decide()` (decisions); scoped to the target's table by the row filter.
 */
export function changeRequestsResource(target: ResourceConfig): ResourceConfig {
  const rule = target.changeApproval;
  if (!rule) throw new Error(`${target.label} has no change approval rule`);
  return {
    id: "changes",
    label: "Change requests",
    singular: "Change request",
    table: CHANGE_REQUESTS,
    fields: [
      { name: "resource_key", label: "Resource", type: "text", required: true },
      { name: "record_id", label: "Record", type: "text", required: true },
      { name: "kind", label: "Change", type: "enum", options: ["update", "delete"], required: true },
      { name: "data", label: "Proposed", type: "json" },
      { name: "before", label: "Before", type: "json" },
      { name: "status", label: "Status", type: "enum", options: Object.values(CHANGE_STATES) },
      { name: "requester_id", label: "Requester", type: "user" },
    ],
    list: { columns: ["created_at", "requester_id", "kind", "data", "status"], sort: { field: "created_at", dir: "asc" } },
    permissions: { read: target.permissions.read, create: rule.requesterRole },
    rowFilter: () => ({ resource_key: target.table }),
    statusField: "status",
    approval: { approverRole: rule.approverRole, requesterField: "requester_id", states: CHANGE_STATES },
    transformRow: (row, user) => ({
      ...row,
      data: maskSnapshot(row.data, target, user.role),
      before: maskSnapshot(row.before, target, user.role),
    }),
  };
}
