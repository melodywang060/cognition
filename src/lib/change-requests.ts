import { decide, listApprovals, type Decision, type DecisionResult } from "./approvals";
import { ApprovalRequiredError, ConflictError, isUniqueViolation, NotFoundError } from "./errors";
import { repo, type Mutation } from "./repo";
import { assertRole, type User } from "./roles";
import { changeRequestsResource } from "./system-resources";
import type { ResourceConfig, Row } from "./types";

/**
 * Maker-checker for edits, declared by a resource's `changeApproval` rule. `repo.mutate()` refuses
 * gated changes; `submit()` turns them into change requests, and an approval applies the change
 * through `repo.mutate()` in the same transaction (so the record's own audit row is written too).
 */

export type SubmitResult = { row: Row } | { changeRequest: Row };

/** Applies a mutation, or records it as a change request when the resource's rule holds it. */
export async function submit(user: User, config: ResourceConfig, mutation: Mutation): Promise<SubmitResult> {
  try {
    return { row: await repo.mutate(user, config, mutation) };
  } catch (e) {
    if (!(e instanceof ApprovalRequiredError) || !config.changeApproval) throw e;
    assertRole(user, config.changeApproval.requesterRole, `request changes to this ${config.singular.toLowerCase()}`);
    const { kind, id, data, before } = e.change;
    try {
      const changeRequest = await repo.mutate(user, changeRequestsResource(config), {
        kind: "create",
        data: { resource_key: config.table, record_id: id, kind, data, before },
      });
      return { changeRequest };
    } catch (err) {
      // A partial unique index allows one open request per record.
      if (isUniqueViolation(err)) throw new ConflictError(`This ${config.singular.toLowerCase()} already has an open change request`);
      throw err;
    }
  }
}

export function listChangeRequests(user: User, config: ResourceConfig, recordId: string): Promise<Row[]> {
  return repo.query(user, changeRequestsResource(config), { where: { record_id: recordId } });
}

/** Approve or deny a change request; approval applies the stored change as the approver. */
export async function decideChange(
  user: User,
  config: ResourceConfig,
  recordId: string,
  changeId: string,
  decision: Decision,
  reason?: string,
): Promise<DecisionResult> {
  if (!config.changeApproval) throw new NotFoundError(`${config.label} has no change approval rule`);
  const crs = changeRequestsResource(config);
  const cr = await repo.get(user, crs, changeId);
  if (!cr || cr.record_id !== recordId) throw new NotFoundError("Change request not found");
  return decide(user, crs, changeId, decision, reason, async (tx, row) => {
    const before = row.before as Record<string, unknown>;
    const mutation: Mutation =
      row.kind === "delete"
        ? { kind: "delete", id: recordId }
        : { kind: "update", id: recordId, data: row.data as Record<string, unknown> };
    await repo.mutate(user, config, mutation, { tx, approvedChange: { before } });
  });
}

/** Approval decisions on a record's change requests (for its history). */
export async function changeRequestApprovals(user: User, config: ResourceConfig, changeRequests: Row[]): Promise<Row[]> {
  const crs = changeRequestsResource(config);
  return (await Promise.all(changeRequests.map((cr) => listApprovals(user, crs, cr.id)))).flat();
}
