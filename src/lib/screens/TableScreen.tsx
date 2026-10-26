import { allFields, canSeeField, repo } from "../repo";
import type { User } from "../roles";
import type { FieldConfig, ResourceConfig, Row, Where } from "../types";
import { DataTable } from "./DataTable";

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function toNumber(f: FieldConfig, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return f.type === "money" ? Math.round(n * 100) : Math.trunc(n);
}

function parseFilters(resource: ResourceConfig, user: User, sp: SearchParams): Where {
  const where: Where = {};
  for (const filter of resource.list.filters ?? []) {
    const f = allFields(resource).find((x) => x.name === filter.field);
    if (!f || !canSeeField(user, f)) continue;
    if (filter.kind === "range") {
      const gte = toNumber(f, one(sp[`${f.name}_min`]));
      const lte = toNumber(f, one(sp[`${f.name}_max`]));
      if (gte !== undefined || lte !== undefined) where[f.name] = { gte, lte };
    } else {
      const v = one(sp[f.name]);
      if (v) where[f.name] = filter.kind === "text" ? { contains: v } : v;
    }
  }
  return where;
}

const input = "rounded border border-gray-300 px-2 py-1 text-sm";

/** Generic list screen: search box, config-declared filters, and a table. Reads via repo.query(). */
export async function TableScreen({
  user,
  resource,
  users,
  searchParams,
  rowHref,
}: {
  user: User;
  resource: ResourceConfig;
  users: User[];
  searchParams: SearchParams;
  rowHref?: (row: Row) => string;
}) {
  const fields = allFields(resource);
  const visible = (name: string) => fields.find((f) => f.name === name && canSeeField(user, f));
  const columns = resource.list.columns.map(visible).filter((f): f is FieldConfig => !!f);
  const filters = (resource.list.filters ?? [])
    .map((flt) => ({ ...flt, f: visible(flt.field) }))
    .filter((x): x is typeof x & { f: FieldConfig } => !!x.f);
  const q = one(searchParams.q);
  const rows = await repo.query(user, resource, { where: parseFilters(resource, user, searchParams), search: q });

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-3" method="get">
        {resource.list.search?.length ? (
          <label className="flex flex-col text-xs text-gray-600">
            Search
            <input name="q" defaultValue={q} className={input} />
          </label>
        ) : null}
        {filters.map(({ f, kind }) => (
          <label key={f.name} className="flex flex-col text-xs text-gray-600">
            {f.label}
            {kind === "select" ? (
              <select name={f.name} defaultValue={one(searchParams[f.name]) ?? ""} className={input}>
                <option value="">Any</option>
                {f.type === "user"
                  ? users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))
                  : f.options?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
              </select>
            ) : kind === "range" ? (
              <span className="flex gap-1">
                <input name={`${f.name}_min`} placeholder="min" defaultValue={one(searchParams[`${f.name}_min`])} className={`${input} w-24`} />
                <input name={`${f.name}_max`} placeholder="max" defaultValue={one(searchParams[`${f.name}_max`])} className={`${input} w-24`} />
              </span>
            ) : (
              <input name={f.name} defaultValue={one(searchParams[f.name])} className={input} />
            )}
          </label>
        ))}
        <button className="rounded bg-gray-800 px-3 py-1.5 text-sm text-white">Apply</button>
      </form>
      <DataTable fields={columns} rows={rows} users={users} rowHref={rowHref} />
      <p className="text-xs text-gray-500">{rows.length} record(s)</p>
    </div>
  );
}
