import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { writeAudit } from "./audit";
import { prisma } from "./db";
import { NotFoundError, ValidationError } from "./errors";
import { assertRole, hasRole, type Role, type User } from "./roles";
import type { Condition, FieldConfig, FieldType, ResourceConfig, Row, Value, Where } from "./types";

/**
 * The only way app code reads or writes app tables.
 * - query(): role check, row filter, field masks.
 * - mutate(): role check, validation, write + audit row in one transaction.
 */

export type Tx = Prisma.TransactionClient;

export type Mutation =
  | { kind: "create"; data: Record<string, unknown> }
  | { kind: "update"; id: string; data: Record<string, unknown> }
  | { kind: "delete"; id: string };

export interface MutateOptions {
  /** Run inside an existing transaction (e.g. approvals). */
  tx?: Tx;
  /**
   * Permission and audit action name. Defaults to the mutation kind.
   * `approve`/`deny` and transition names are reserved for `approvals.ts` / `transitions.ts`
   * and are the only actions allowed to write the status and requester fields.
   */
  action?: string;
}

export interface QueryOptions {
  where?: Where;
  search?: string;
  orderBy?: { field: string; dir: "asc" | "desc" };
  limit?: number;
  offset?: number;
  tx?: Tx;
  /** Lock the selected rows until the transaction ends. Requires `tx`. */
  forUpdate?: boolean;
}

const CAST: Record<FieldType, string> = {
  text: "text",
  enum: "text",
  user: "text",
  integer: "int",
  money: "int",
  boolean: "boolean",
  timestamp: "timestamptz",
  json: "jsonb",
};

const BUILTIN: FieldConfig[] = [
  { name: "id", label: "ID", type: "text" },
  { name: "created_at", label: "Created", type: "timestamp" },
];

export function allFields(config: ResourceConfig): FieldConfig[] {
  return [...BUILTIN.filter((b) => !config.fields.some((f) => f.name === b.name)), ...config.fields];
}

export function canSeeField(user: User, f: FieldConfig): boolean {
  return !f.readRole || hasRole(user.role, f.readRole);
}

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Invalid identifier "${name}"`);
  return `"${name}"`;
}

class Sql {
  params: unknown[] = [];
  param(f: FieldConfig, value: unknown, array = false): string {
    this.params.push(f.type === "json" && value != null ? JSON.stringify(value) : value);
    return `$${this.params.length}::${CAST[f.type]}${array ? "[]" : ""}`;
  }
}

/** Masked fields are reported as unknown so their existence isn't revealed. */
function lookup(config: ResourceConfig, name: string, user: User | null): FieldConfig {
  const f = allFields(config).find((x) => x.name === name);
  if (!f || (user && !canSeeField(user, f))) throw new ValidationError(`Unknown field "${name}"`);
  return f;
}

function isOperator(c: Condition): c is Exclude<Condition, Value> {
  return c !== null && typeof c === "object" && !(c instanceof Date);
}

/** `user` = null skips field-mask checks (used for config-declared row filters). */
function whereSql(config: ResourceConfig, where: Where | undefined, user: User | null, sql: Sql): string[] {
  const out: string[] = [];
  for (const [name, cond] of Object.entries(where ?? {})) {
    const f = lookup(config, name, user);
    const col = ident(f.name);
    if (cond === null) out.push(`${col} IS NULL`);
    else if (!isOperator(cond)) out.push(`${col} = ${sql.param(f, cond)}`);
    else {
      if (cond.eq !== undefined) out.push(cond.eq === null ? `${col} IS NULL` : `${col} = ${sql.param(f, cond.eq)}`);
      if (cond.in) out.push(cond.in.length ? `${col} = ANY(${sql.param(f, cond.in, true)})` : "FALSE");
      if (cond.contains !== undefined)
        out.push(`${col}::text ILIKE ${sql.param({ ...f, type: "text" }, `%${escapeLike(cond.contains)}%`)}`);
      if (cond.gte !== undefined) out.push(`${col} >= ${sql.param(f, cond.gte)}`);
      if (cond.lte !== undefined) out.push(`${col} <= ${sql.param(f, cond.lte)}`);
    }
  }
  return out;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Drops undeclared and masked fields, then applies the resource's row transform. */
function present(config: ResourceConfig, user: User, raw: Record<string, unknown>): Row {
  const row: Record<string, unknown> = {};
  for (const f of allFields(config)) {
    if (f.name in raw && canSeeField(user, f)) row[f.name] = raw[f.name];
  }
  return config.transformRow ? config.transformRow(row as Row, user) : (row as Row);
}

async function select(
  config: ResourceConfig,
  user: User,
  opts: QueryOptions,
): Promise<Record<string, unknown>[]> {
  const sql = new Sql();
  const conds = [
    ...whereSql(config, opts.where, user, sql),
    ...whereSql(config, config.rowFilter?.(user), null, sql),
  ];
  const searchable = (config.list.search ?? [])
    .map((n) => lookup(config, n, null))
    .filter((f) => canSeeField(user, f));
  if (opts.search?.trim() && searchable.length) {
    const p = sql.param({ name: "q", label: "", type: "text" }, `%${escapeLike(opts.search.trim())}%`);
    conds.push(`(${searchable.map((f) => `${ident(f.name)}::text ILIKE ${p}`).join(" OR ")})`);
  }
  const order = opts.orderBy ?? config.list.sort ?? { field: "created_at", dir: "desc" };
  const orderField = lookup(config, order.field, user);
  const dir = order.dir === "asc" ? "ASC" : "DESC";
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 200), 1), 1000);
  const offset = Math.max(Math.trunc(opts.offset ?? 0), 0);
  const text =
    `SELECT * FROM ${ident(config.table)}` +
    (conds.length ? ` WHERE ${conds.join(" AND ")}` : "") +
    ` ORDER BY ${ident(orderField.name)} ${dir}, "id" ${dir} LIMIT ${limit} OFFSET ${offset}` +
    (opts.forUpdate ? " FOR UPDATE" : "");
  return (opts.tx ?? prisma).$queryRawUnsafe<Record<string, unknown>[]>(text, ...sql.params);
}

async function query(user: User, config: ResourceConfig, opts: QueryOptions = {}): Promise<Row[]> {
  assertRole(user, config.permissions.read, `read ${config.label}`);
  const rows = await select(config, user, opts);
  return rows.map((r) => present(config, user, r));
}

async function get(
  user: User,
  config: ResourceConfig,
  id: string,
  opts: Pick<QueryOptions, "tx" | "forUpdate"> = {},
): Promise<Row | null> {
  const [row] = await query(user, config, { ...opts, where: { id }, limit: 1 });
  return row ?? null;
}

function requiredRole(config: ResourceConfig, action: string): Role | undefined {
  if (action === "approve" || action === "deny") return config.approval?.approverRole;
  const transition = config.transitions?.[action];
  if (transition) return transition.role;
  if (action === "create" || action === "update" || action === "delete") return config.permissions[action];
  return undefined;
}

function protectedFields(config: ResourceConfig): string[] {
  return [config.statusField, config.approval?.requesterField].filter((f): f is string => !!f);
}

function coerce(f: FieldConfig, value: unknown): unknown {
  if (value === null || value === undefined || value === "") return null;
  const bad = () => new ValidationError(`Invalid value for "${f.label}"`);
  switch (f.type) {
    case "text":
    case "user":
      if (typeof value !== "string") throw bad();
      return value.trim() || null;
    case "enum":
      if (typeof value !== "string" || !f.options?.includes(value)) throw bad();
      return value;
    case "integer":
    case "money":
      if (typeof value !== "number" || !Number.isSafeInteger(value)) throw bad();
      if (f.type === "money" && value < 0) throw bad();
      return value;
    case "boolean":
      if (typeof value !== "boolean") throw bad();
      return value;
    case "timestamp": {
      const d = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
      if (!d || Number.isNaN(d.getTime())) throw bad();
      return d;
    }
    case "json":
      return value;
  }
}

function clean(
  config: ResourceConfig,
  data: Record<string, unknown>,
  { partial, action }: { partial: boolean; action: string },
): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ValidationError("Body must be an object");
  const isp = protectedFields(config);
  const privileged = action === "approve" || action === "deny" || !!config.transitions?.[action];
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(data)) {
    const f = config.fields.find((x) => x.name === name);
    if (!f) throw new ValidationError(`Unknown field "${name}"`);
    if (isp.includes(name) && !privileged) throw new ValidationError(`"${f.label}" is managed by the workflow`);
    out[name] = coerce(f, value);
  }
  for (const f of config.fields) {
    if (!f.required || isp.includes(f.name)) continue;
    const missing = partial ? f.name in out && out[f.name] === null : out[f.name] == null;
    if (missing) throw new ValidationError(`"${f.label}" is required`);
  }
  return out;
}

function columns(config: ResourceConfig, data: Record<string, unknown>, sql: Sql) {
  return Object.entries(data).map(([name, value]) => {
    const f = lookup(config, name, null);
    return { col: ident(name), val: sql.param(f, value) };
  });
}

async function mutate(
  user: User,
  config: ResourceConfig,
  mutation: Mutation,
  options: MutateOptions = {},
): Promise<Row> {
  const action = options.action ?? mutation.kind;
  assertRole(user, requiredRole(config, action), `${action} ${config.label}`);
  const table = ident(config.table);

  const run = async (tx: Tx): Promise<Row> => {
    let before: Record<string, unknown> | null = null;
    let after: Record<string, unknown> | null = null;
    const sql = new Sql();

    if (mutation.kind === "create") {
      const data: Record<string, unknown> = { id: randomUUID(), ...clean(config, mutation.data, { partial: false, action }) };
      if (config.approval && config.statusField) {
        data[config.approval.requesterField] = user.id;
        data[config.statusField] = config.approval.states.pending;
      }
      const cols = columns(config, data, sql);
      [after] = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
        `INSERT INTO ${table} (${cols.map((c) => c.col).join(", ")}) VALUES (${cols.map((c) => c.val).join(", ")}) RETURNING *`,
        ...sql.params,
      );
    } else {
      // The caller must be able to see the row (row filter) to change it.
      [before] = await select(config, user, { where: { id: mutation.id }, limit: 1, tx, forUpdate: true });
      if (!before) throw new NotFoundError(`${config.singular} not found`);
      if (mutation.kind === "update") {
        const data = clean(config, mutation.data, { partial: true, action });
        if (!Object.keys(data).length) throw new ValidationError("Nothing to update");
        const sets = columns(config, data, sql).map((c) => `${c.col} = ${c.val}`);
        const idParam = sql.param(BUILTIN[0], mutation.id);
        [after] = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
          `UPDATE ${table} SET ${sets.join(", ")} WHERE "id" = ${idParam} RETURNING *`,
          ...sql.params,
        );
      } else {
        await tx.$executeRawUnsafe(`DELETE FROM ${table} WHERE "id" = ${sql.param(BUILTIN[0], mutation.id)}`, ...sql.params);
      }
    }

    const record = (after ?? before)!;
    await writeAudit(tx, {
      actorId: user.id,
      action,
      tableName: config.table,
      recordId: String(record.id),
      before,
      after,
    });
    return present(config, user, record);
  };

  return options.tx ? run(options.tx) : prisma.$transaction(run);
}

/** Runs several repo calls atomically: pass the `tx` to each call. */
function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn);
}

export const repo = { query, get, mutate, transaction };
