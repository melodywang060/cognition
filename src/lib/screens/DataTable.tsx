import Link from "next/link";
import type { User } from "../roles";
import type { FieldConfig, Row } from "../types";
import { FieldValue } from "./format";

export function DataTable({
  fields,
  rows,
  users,
  rowHref,
}: {
  fields: FieldConfig[];
  rows: Row[];
  users: User[];
  rowHref?: (row: Row) => string;
}) {
  if (!rows.length) return <p className="py-6 text-sm text-gray-500">No records.</p>;
  return (
    <div className="overflow-x-auto rounded border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {fields.map((f) => (
              <th key={f.name} className="px-3 py-2 text-left font-medium text-gray-600">
                {f.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.id} className="align-top hover:bg-gray-50">
              {fields.map((f, i) => (
                <td key={f.name} className="px-3 py-2">
                  {rowHref && i === 0 ? (
                    <Link href={rowHref(row)} className="text-blue-700 hover:underline">
                      <FieldValue field={f} value={row[f.name]} users={users} />
                    </Link>
                  ) : (
                    <FieldValue field={f} value={row[f.name]} users={users} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
