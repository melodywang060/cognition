import { listUsers } from "@/lib/auth";
import { requirePageRole, requirePageUser } from "@/lib/screens/page-guards";
import { TableScreen, type SearchParams } from "@/lib/screens/TableScreen";
import { auditResource } from "@/lib/system-resources";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageUser();
  requirePageRole(user, auditResource.permissions.read);
  return (
    <main className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="mt-1 text-sm text-gray-600">Every write, across all apps. Read-only.</p>
      </div>
      <TableScreen user={user} resource={auditResource} users={await listUsers()} searchParams={await searchParams} />
    </main>
  );
}
