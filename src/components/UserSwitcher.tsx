"use client";

import { useRouter } from "next/navigation";
import type { User } from "@/lib/roles";

/** Auth stub: picks the current user (sets the `uid` cookie). */
export function UserSwitcher({ users, currentId }: { users: User[]; currentId?: string }) {
  const router = useRouter();
  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: e.target.value }),
    });
    router.refresh();
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-gray-300">Signed in as</span>
      <select
        aria-label="Switch user"
        value={currentId ?? ""}
        onChange={onChange}
        className="rounded border border-gray-500 bg-gray-800 px-2 py-1 text-white"
      >
        {!currentId && <option value="">Choose a user…</option>}
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} ({u.role})
          </option>
        ))}
      </select>
    </label>
  );
}
