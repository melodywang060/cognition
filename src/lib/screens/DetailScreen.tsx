import { notFound } from "next/navigation";
import { listApprovals, requiredApprovals } from "../approvals";
import { allFields, canSeeField, repo } from "../repo";
import { hasRole, type User } from "../roles";
import { approvalsResource, auditResource } from "../system-resources";
import type { ResourceConfig } from "../types";
import { DataTable } from "./DataTable";
import { FieldValue } from "./format";
import { recordHistory } from "./history";
import { RecordActions } from "./RecordActions";

/** Generic detail screen: fields, approvals, actions and the record's audit history. */
export async function DetailScreen({
  user,
  resource,
  id,
  users,
  apiBase,
}: {
  user: User;
  resource: ResourceConfig;
  id: string;
  users: User[];
  apiBase: string;
}) {
  const row = await repo.get(user, resource, id);
  if (!row) notFound();
  const fields = allFields(resource).filter((f) => canSeeField(user, f) && f.name in row);
  const rule = resource.approval;
  const status = resource.statusField ? String(row[resource.statusField]) : undefined;
  const approvals = rule ? await listApprovals(user, resource, id) : [];
  const canDecide =
    !!rule &&
    hasRole(user.role, rule.approverRole) &&
    status === rule.states.pending &&
    row[rule.requesterField] !== user.id &&
    !approvals.some((a) => a.approver_id === user.id);
  const transitions = Object.entries(resource.transitions ?? {})
    .filter(([, t]) => hasRole(user.role, t.role) && status !== undefined && t.from.includes(status))
    .map(([name, t]) => ({ name, label: t.label }));
  const canSeeAudit = hasRole(user.role, auditResource.permissions.read);
  const history = canSeeAudit ? await recordHistory(user, resource, id, approvals) : [];
  const field = (name: string) => allFields(auditResource).find((f) => f.name === name)!;

  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        {fields.map((f) => (
          <div key={f.name} className="contents">
            <dt className="font-medium text-gray-600">{f.label}</dt>
            <dd>
              <FieldValue field={f} value={row[f.name]} users={users} />
            </dd>
          </div>
        ))}
      </dl>

      {rule && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Approvals</h2>
          <p className="text-sm text-gray-600">
            Needs {requiredApprovals(rule, row)} distinct approval(s) from a {rule.approverRole} or above who is not the
            requester.
          </p>
          <DataTable fields={allFields(approvalsResource).filter((f) => approvalsResource.list.columns.includes(f.name))} rows={approvals} users={users} />
        </section>
      )}

      <RecordActions apiBase={apiBase} canDecide={canDecide} transitions={transitions} />

      {canSeeAudit && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Audit history</h2>
          <DataTable fields={["created_at", "actor_id", "action", "table_name", "before", "after"].map(field)} rows={history} users={users} />
        </section>
      )}
    </div>
  );
}
