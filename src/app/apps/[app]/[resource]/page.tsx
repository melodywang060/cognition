import Link from "next/link";
import { listUsers } from "@/lib/auth";
import { hasRole } from "@/lib/roles";
import { pageResource, requirePageRole, requirePageUser } from "@/lib/screens/page-guards";
import { TableScreen, type SearchParams } from "@/lib/screens/TableScreen";

export const dynamic = "force-dynamic";

export default async function ListPage({
  params,
  searchParams,
}: {
  params: Promise<{ app: string; resource: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const p = await params;
  const user = await requirePageUser();
  const { app, resource } = pageResource(p.app, p.resource);
  requirePageRole(user, resource.permissions.read);
  const base = `/apps/${app.id}/${resource.id}`;
  const canCreate = !!resource.form && !!resource.permissions.create && hasRole(user.role, resource.permissions.create);
  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {app.name}: {resource.label}
        </h1>
        {canCreate && (
          <Link href={`${base}/new`} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white">
            New {resource.singular.toLowerCase()}
          </Link>
        )}
      </div>
      <TableScreen
        user={user}
        resource={resource}
        users={await listUsers()}
        searchParams={await searchParams}
        rowHref={(row) => `${base}/${row.id}`}
      />
    </main>
  );
}
