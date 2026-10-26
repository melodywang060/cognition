import { notFound } from "next/navigation";
import { listApprovals, requiredApprovals } from "../approvals";
import { changeRequestApprovals, listChangeRequests } from "../change-requests";
import { allFields, canSeeField, matchesWhere, repo } from "../repo";
import { hasRole, type User } from "../roles";
import { approvalsResource, auditResource, CHANGE_STATES, changeRequestsResource } from "../system-resources";
import type { ResourceConfig, Row, Where } from "../types";
import { DataTable } from "./DataTable";
import { FieldValue } from "./format";
import { FormScreen } from "./FormScreen";
import { canSeeHistory, recordHistory } from "./history";
import { RecordActions } from "./RecordActions";

const describeWhere = (where: Where) =>
  Object.entries(where)
    .map(([k, c]) => `${k} ${c !== null && typeof c === "object" && !(c instanceof Date) ? JSON.stringify(c) : `= ${String(c)}`}`)
    .join(" and ");

/** Generic detail screen: fields, edit form, approvals, change requests, actions and the record's audit history. */
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
  const change = resource.changeApproval;
  const changeRequests = change ? await listChangeRequests(user, resource, id) : [];
  const changeApprovals = change ? await changeRequestApprovals(user, resource, changeRequests) : [];
  const openChange = changeRequests.find((c) => c.status === CHANGE_STATES.pending);
  const canDecideChange = (cr: Row) =>
    !!change &&
    hasRole(user.role, change.approverRole) &&
    cr.requester_id !== user.id &&
    !changeApprovals.some((a) => a.record_id === cr.id && a.approver_id === user.id);
  const editFields = (resource.edit?.fields ?? resource.form?.fields ?? []).map((n) => resource.fields.find((f) => f.name === n)!);
  const canEdit =
    !!editFields.length &&
    !!resource.permissions.update &&
    hasRole(user.role, resource.permissions.update) &&
    !(change && matchesWhere(row, change.when) && !hasRole(user.role, change.requesterRole));
  const crFields = changeRequests.length
    ? allFields(changeRequestsResource(resource)).filter((f) => changeRequestsResource(resource).list.columns.includes(f.name))
    : [];
  const canSeeAudit = canSeeHistory(user, resource);
  const history = canSeeAudit ? await recordHistory(user, resource, id, [...approvals, ...changeApprovals], changeRequests) : [];
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

      {canEdit && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Edit</h2>
          {change && (
            <p className="text-sm text-gray-600">
              Changes where {describeWhere(change.when)} are requested by a {change.requesterRole} and applied only after a
              different {change.approverRole} approves.
            </p>
          )}
          <FormScreen fields={editFields} apiUrl={apiBase} values={row} />
        </section>
      )}

      {change && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Change requests</h2>
          {changeRequests.length ? (
            <DataTable fields={crFields} rows={changeRequests} users={users} />
          ) : (
            <p className="text-sm text-gray-500">None.</p>
          )}
          {openChange && (
            <RecordActions apiBase={`${apiBase}/changes/${openChange.id}`} canDecide={canDecideChange(openChange)} transitions={[]} />
          )}
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
