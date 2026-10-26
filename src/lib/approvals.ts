import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { repo, type Tx } from "./repo";
import { assertRole, type User } from "./roles";
import { approvalsResource } from "./system-resources";
import type { ApprovalRule, ResourceConfig, Row } from "./types";

/**
 * Shared maker-checker logic. Apps only declare an `approval` rule in their config.
 * - The approver needs at least `approverRole`.
 * - The requester can never approve or deny their own request.
 * - Records with `amountField` > `threshold` need two distinct approvals.
 */

export type Decision = "approve" | "deny";

function ruleOf(config: ResourceConfig): ApprovalRule & { statusField: string } {
  if (!config.approval || !config.statusField) throw new NotFoundError(`${config.label} has no approval rule`);
  return { ...config.approval, statusField: config.statusField };
}

export function requiredApprovals(rule: ApprovalRule, row: Row): number {
  if (!rule.amountField || rule.threshold === undefined) return 1;
  return Number(row[rule.amountField]) > rule.threshold ? 2 : 1;
}

export function listApprovals(user: User, config: ResourceConfig, recordId: string, tx?: Tx): Promise<Row[]> {
  return repo.query(user, approvalsResource, {
    where: { resource_key: config.table, record_id: recordId },
    orderBy: { field: "created_at", dir: "asc" },
    tx,
  });
}

export interface DecisionResult {
  status: string;
  approvals: number;
  required: number;
}

export async function decide(
  user: User,
  config: ResourceConfig,
  recordId: string,
  decision: Decision,
  reason?: string,
  /** Runs in the decision's transaction once the record reaches `approved` (used by change requests). */
  onApproved?: (tx: Tx, row: Row) => Promise<void>,
): Promise<DecisionResult> {
  const rule = ruleOf(config);
  assertRole(user, rule.approverRole, `approve ${config.label}`);
  if (decision !== "approve" && decision !== "deny") throw new ValidationError("Decision must be approve or deny");
  const why = reason?.trim() || null;
  if (decision === "deny" && !why) throw new ValidationError("A reason is required to deny");

  return repo.transaction(async (tx) => {
    // Lock the record so concurrent decisions are serialized.
    const row = await repo.get(user, config, recordId, { tx, forUpdate: true });
    if (!row) throw new NotFoundError(`${config.singular} not found`);
    const required = requiredApprovals(rule, row);
    if (row[rule.requesterField] === user.id) {
      throw new ForbiddenError("The requester cannot approve or deny their own request");
    }
    if (row[rule.statusField] !== rule.states.pending) {
      throw new ConflictError(`${config.singular} is ${String(row[rule.statusField])}, not ${rule.states.pending}`);
    }
    const prior = await listApprovals(user, config, recordId, tx);
    if (prior.some((a) => a.approver_id === user.id)) {
      throw new ConflictError("You have already decided on this request; a second approver must be a different person");
    }

    await repo.mutate(
      user,
      approvalsResource,
      {
        kind: "create",
        data: { resource_key: config.table, record_id: recordId, approver_id: user.id, decision, reason: why },
      },
      { tx },
    );

    const approvals = prior.filter((a) => a.decision === "approve").length + (decision === "approve" ? 1 : 0);
    let status = rule.states.pending;
    if (decision === "deny") status = rule.states.denied;
    else if (approvals >= required) status = rule.states.approved;

    if (status !== rule.states.pending) {
      await repo.mutate(
        user,
        config,
        { kind: "update", id: recordId, data: { [rule.statusField]: status } },
        { tx, action: decision },
      );
    }
    if (status === rule.states.approved) await onApproved?.(tx, row);
    return { status, approvals, required };
  });
}
