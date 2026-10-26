import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

export interface AuditInput {
  actorId: string;
  action: string;
  tableName: string;
  recordId: string;
  before: unknown;
  after: unknown;
}

const toJson = (v: unknown) =>
  v == null ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

/** Called only by `repo.mutate()`, inside the mutation's transaction. */
export async function writeAudit(tx: Prisma.TransactionClient, e: AuditInput): Promise<void> {
  await tx.auditEvent.create({
    data: {
      id: randomUUID(),
      actorId: e.actorId,
      action: e.action,
      tableName: e.tableName,
      recordId: e.recordId,
      before: toJson(e.before),
      after: toJson(e.after),
    },
  });
}
