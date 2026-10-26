import { ConflictError, NotFoundError } from "./errors";
import { repo } from "./repo";
import { assertRole, type User } from "./roles";
import type { ResourceConfig, Row } from "./types";

/** Applies a config-declared status transition (e.g. approved -> issued). */
export async function applyTransition(user: User, config: ResourceConfig, recordId: string, name: string): Promise<Row> {
  const t = config.transitions?.[name];
  if (!t || !config.statusField) throw new NotFoundError(`Unknown action "${name}"`);
  const statusField = config.statusField;
  assertRole(user, t.role, `${name} ${config.label}`);
  return repo.transaction(async (tx) => {
    const row = await repo.get(user, config, recordId, { tx, forUpdate: true });
    if (!row) throw new NotFoundError(`${config.singular} not found`);
    if (!t.from.includes(String(row[statusField]))) {
      throw new ConflictError(`Cannot ${t.label.toLowerCase()} a ${config.singular.toLowerCase()} that is ${String(row[statusField])}`);
    }
    return repo.mutate(user, config, { kind: "update", id: recordId, data: { [statusField]: t.to } }, { tx, action: name });
  });
}
