import type { Role, User } from "./roles";

export type FieldType = "text" | "integer" | "money" | "boolean" | "timestamp" | "json" | "enum" | "user";

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  /** Allowed values for `enum` fields. */
  options?: readonly string[];
  required?: boolean;
  /** Field mask: roles below this never receive the field from `repo.query()`. */
  readRole?: Role;
  /** Inclusive bounds for `integer` and `money` fields. */
  min?: number;
  max?: number;
  /** Value used on create when the field is not supplied. */
  default?: Value;
}

export type Value = string | number | boolean | Date | null;

export type Condition =
  | Value
  | { eq?: Value; in?: Value[]; contains?: string; gte?: number | Date; lte?: number | Date };

/** Column name -> condition. Every column must be declared in the resource's `fields`. */
export type Where = Record<string, Condition>;

export type Row = Record<string, unknown> & { id: string };

export interface FilterConfig {
  field: string;
  /** `select` uses the field's options (or users for `user` fields); `range` gives min/max inputs. */
  kind: "select" | "text" | "range";
}

/** Declares maker-checker rules; the shared logic lives in `src/lib/approvals.ts`. */
export interface ApprovalRule {
  /** Minimum role allowed to approve or deny. */
  approverRole: Role;
  requesterField: string;
  states: { pending: string; approved: string; denied: string };
  /** Records whose `amountField` is strictly greater than `threshold` need two distinct approvers. Omit both for one. */
  amountField?: string;
  threshold?: number;
}

/**
 * Maker-checker for edits (see `src/lib/change-requests.ts`). Updates and deletes of rows that match
 * `when` before or after the change are held as change requests: a `requesterRole` user requests,
 * and a different `approverRole` user approves, which applies the change. Creating a matching row
 * needs `requesterRole`; give gated fields safe `default`s and keep them off the create form.
 */
export interface ChangeApprovalRule {
  when: Where;
  requesterRole: Role;
  approverRole: Role;
}

/** A named status change (e.g. "issue") that a role may apply from specific states. */
export interface TransitionConfig {
  label: string;
  role: Role;
  from: readonly string[];
  to: string;
}

export interface ResourceConfig {
  /** URL segment, unique within its app. */
  id: string;
  label: string;
  singular: string;
  /** Postgres table. Must have `id text primary key` and `created_at timestamptz default now()`. */
  table: string;
  fields: FieldConfig[];
  list: {
    columns: string[];
    filters?: FilterConfig[];
    /** Text fields matched by the search box (case-insensitive contains). */
    search?: string[];
    sort?: { field: string; dir: "asc" | "desc" };
  };
  /** Fields shown on the create form. Omit to disable the form. */
  form?: { fields: string[] };
  /** Fields editable on the detail page (PATCH). Defaults to `form.fields`; omit both to disable editing. */
  edit?: { fields: string[] };
  /** Minimum role per operation. A missing operation is denied to everyone. */
  permissions: { read: Role; create?: Role; update?: Role; delete?: Role };
  /** Row filter applied inside `repo.query()`; return undefined for no restriction. */
  rowFilter?: (user: User) => Where | undefined;
  /** Required with `approval` or `transitions`. Only approvals and transitions may change it. */
  statusField?: string;
  approval?: ApprovalRule;
  transitions?: Record<string, TransitionConfig>;
  changeApproval?: ChangeApprovalRule;
  /** Minimum role to see a record's audit history on its detail page. Defaults to the audit page's role. */
  historyRole?: Role;
  /** System resources only: post-process rows after masking (e.g. mask audit before/after). */
  transformRow?: (row: Row, user: User) => Row;
}

export interface AppConfig {
  /** URL segment. */
  id: string;
  name: string;
  description: string;
  resources: ResourceConfig[];
}
