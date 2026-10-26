import { repo } from "../repo";
import type { User } from "../roles";
import { hasRole } from "../roles";
import { approvalsResource, auditResource, changeRequestsResource } from "../system-resources";
import type { ResourceConfig, Row } from "../types";

const time = (r: Row) => new Date(r.created_at as string | Date).getTime();

/** Minimum role to see a record's history: the resource's `historyRole`, else the audit page's role. */
export function historyRole(resource: ResourceConfig) {
  return resource.historyRole ?? auditResource.permissions.read;
}

export function canSeeHistory(user: User, resource: ResourceConfig): boolean {
  return hasRole(user.role, historyRole(resource));
}

/**
 * A record's audit history: its own audit rows plus those of its approval decisions (a first
 * approval doesn't change the record) and of its change requests. `decide()` writes the approval,
 * then the status change, then any approved change in one transaction, so they share a timestamp;
 * on a tie they are listed in that order.
 */
export async function recordHistory(
  user: User,
  resource: ResourceConfig,
  id: string,
  approvals: Row[],
  changeRequests: Row[] = [],
): Promise<Row[]> {
  // Scoped to this record's rows, so the resource may let more roles see them than the audit page.
  const audit = { ...auditResource, permissions: { read: historyRole(resource) } };
  const rowsOf = (table: string, ids: string[]) =>
    ids.length ? repo.query(user, audit, { where: { table_name: table, record_id: { in: ids } } }) : Promise.resolve([]);
  const crTable = resource.changeApproval ? changeRequestsResource(resource).table : undefined;
  const lists = await Promise.all([
    rowsOf(resource.table, [id]),
    rowsOf(approvalsResource.table, approvals.map((a) => a.id)),
    crTable ? rowsOf(crTable, changeRequests.map((c) => c.id)) : [],
  ]);
  const rank = (r: Row) => (r.table_name === approvalsResource.table ? 0 : r.table_name === crTable ? 1 : 2);
  return lists.flat().sort((a, b) => time(a) - time(b) || rank(a) - rank(b));
}
