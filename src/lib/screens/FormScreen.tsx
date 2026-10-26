"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FieldConfig, Row } from "../types";

const input = "w-full rounded border border-gray-300 px-2 py-1.5 text-sm";

function toValue(f: FieldConfig, raw: FormDataEntryValue | null): unknown {
  if (f.type === "boolean") return raw === "on";
  if (raw === null || raw === "") return null;
  const s = String(raw);
  if (f.type === "money") return Math.round(Number(s) * 100);
  if (f.type === "integer") return Number(s);
  if (f.type === "timestamp") return new Date(s).toISOString();
  return s;
}

/**
 * Generic create form, or edit form when `values` is given (PATCH to `apiUrl`, then stay on the page).
 * The server validates and authorizes; this only collects input.
 */
export function FormScreen({
  fields,
  apiUrl,
  detailBase,
  values,
}: {
  fields: FieldConfig[];
  apiUrl: string;
  detailBase?: string;
  values?: Row;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const initial = (f: FieldConfig) => {
    const v = values?.[f.name];
    if (v == null) return f.type === "enum" ? "" : undefined;
    return f.type === "money" ? Number(v) / 100 : String(v);
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries(fields.map((f) => [f.name, toValue(f, form.get(f.name))]));
    const method = values ? "PATCH" : "POST";
    const res = await fetch(apiUrl, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? `Error ${res.status}`);
    if (json.changeRequest) setNotice("Change request submitted. It applies once a second person approves it.");
    else if (values) setNotice("Saved.");
    else router.push(`${detailBase}/${json.row.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-4">
      {fields.map((f) => (
        <label key={f.name} className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">
            {f.label}
            {f.required && " *"}
          </span>
          {f.type === "enum" ? (
            <select name={f.name} className={input} required={f.required} defaultValue={initial(f)}>
              <option value="" disabled>
                Choose…
              </option>
              {f.options?.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : f.type === "boolean" ? (
            <input type="checkbox" name={f.name} defaultChecked={!!values?.[f.name]} />
          ) : (
            <input
              name={f.name}
              required={f.required}
              defaultValue={initial(f)}
              className={input}
              type={f.type === "money" || f.type === "integer" ? "number" : f.type === "timestamp" ? "datetime-local" : "text"}
              step={f.type === "money" ? "0.01" : undefined}
              min={f.min ?? (f.type === "money" ? 0 : undefined)}
              max={f.max}
            />
          )}
        </label>
      ))}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}
      <button disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50">
        {values ? "Save" : "Submit"}
      </button>
    </form>
  );
}
