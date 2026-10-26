import { repo } from "../repo";
import type { User } from "../roles";
import { approvalsResource, auditResource } from "../system-resources";
import type { ResourceConfig, Row } from "../types";

const time = (r: Row) => new Date(r.created_at as string | Date).getTime();

/**
 * A record's audit history: its own audit rows plus those of its approval decisions
 * (a first approval doesn't change the record). `decide()` writes the approval and then the
 * status change in one transaction, so they share a timestamp; on a tie the approval comes first.
 */
export async function recordHistory(user: User, resource: ResourceConfig, id: string, approvals: Row[]): Promise<Row[]> {
  const [own, decisions] = await Promise.all([
    repo.query(user, auditResource, { where: { table_name: resource.table, record_id: id } }),
    approvals.length
      ? repo.query(user, auditResource, {
          where: { table_name: approvalsResource.table, record_id: { in: approvals.map((a) => a.id) } },
        })
      : [],
  ]);
  const rank = (r: Row) => (r.table_name === approvalsResource.table ? 0 : 1);
  return [...own, ...decisions].sort((a, b) => time(a) - time(b) || rank(a) - rank(b));
}
