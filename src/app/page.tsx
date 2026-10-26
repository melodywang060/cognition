import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { listApps } from "@/lib/registry";
import { hasRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  const apps = listApps();
  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Apps</h1>
        <p className="mt-1 text-sm text-gray-600">
          {user ? (
            <>
              Signed in as <strong>{user.name}</strong> with role <strong>{user.role}</strong>.
            </>
          ) : (
            "Choose a user from the switcher in the top right."
          )}
        </p>
      </div>
      {apps.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 p-6 text-gray-600">No apps registered yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {apps.map((app) => (
            <li key={app.id} className="rounded border border-gray-200 p-4">
              <Link href={`/apps/${app.id}`} className="font-medium text-blue-700 hover:underline">
                {app.name}
              </Link>
              <p className="mt-1 text-sm text-gray-600">{app.description}</p>
            </li>
          ))}
        </ul>
      )}
      {user && hasRole(user.role, "reviewer") && (
        <p className="text-sm">
          <Link href="/audit" className="text-blue-700 hover:underline">
            Audit log →
          </Link>
        </p>
      )}
    </main>
  );
}
