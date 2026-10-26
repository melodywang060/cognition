"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Approve/deny and transition buttons. Visibility is a hint only; the server re-checks everything. */
export function RecordActions({
  apiBase,
  canDecide,
  transitions,
}: {
  apiBase: string;
  canDecide: boolean;
  transitions: { name: string; label: string }[];
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function post(url: string, body?: unknown) {
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) setError((await res.json()).error ?? `Error ${res.status}`);
    router.refresh();
  }

  if (!canDecide && !transitions.length) return null;
  return (
    <div className="space-y-2 rounded border border-gray-200 p-3">
      {canDecide && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required to deny)"
            className="min-w-64 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <button onClick={() => post(`${apiBase}/approvals`, { decision: "approve", reason })} className="rounded bg-green-700 px-3 py-1.5 text-sm text-white">
            Approve
          </button>
          <button onClick={() => post(`${apiBase}/approvals`, { decision: "deny", reason })} className="rounded bg-red-700 px-3 py-1.5 text-sm text-white">
            Deny
          </button>
        </div>
      )}
      {transitions.map((t) => (
        <button key={t.name} onClick={() => post(`${apiBase}/transitions/${t.name}`)} className="mr-2 rounded bg-gray-800 px-3 py-1.5 text-sm text-white">
          {t.label}
        </button>
      ))}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
