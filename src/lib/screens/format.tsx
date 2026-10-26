import type { User } from "../roles";
import type { FieldConfig } from "../types";

export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function FieldValue({ field, value, users }: { field: FieldConfig; value: unknown; users: User[] }) {
  if (value === null || value === undefined || value === "") return <span className="text-gray-400">—</span>;
  switch (field.type) {
    case "money":
      return <>{formatMoney(Number(value))}</>;
    case "timestamp":
      return <time className="whitespace-nowrap">{new Date(value as string).toISOString().replace("T", " ").slice(0, 19)}</time>;
    case "boolean":
      return <>{value ? "Yes" : "No"}</>;
    case "user":
      return <>{users.find((u) => u.id === value)?.name ?? String(value)}</>;
    case "enum":
      return <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium">{String(value)}</span>;
    case "json":
      return (
        <pre className="max-w-xs overflow-x-auto whitespace-pre-wrap break-all text-xs text-gray-700">
          {JSON.stringify(value, null, 1)}
        </pre>
      );
    default:
      return <>{String(value)}</>;
  }
}
