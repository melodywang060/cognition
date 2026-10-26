import Link from "next/link";
import { listUsers } from "@/lib/auth";
import { DetailScreen } from "@/lib/screens/DetailScreen";
import { pageResource, requirePageRole, requirePageUser } from "@/lib/screens/page-guards";

export const dynamic = "force-dynamic";

export default async function DetailPage({ params }: { params: Promise<{ app: string; resource: string; id: string }> }) {
  const p = await params;
  const user = await requirePageUser();
  const { app, resource } = pageResource(p.app, p.resource);
  requirePageRole(user, resource.permissions.read);
  return (
    <main className="space-y-4">
      <Link href={`/apps/${app.id}/${resource.id}`} className="text-sm text-blue-700 hover:underline">
        ← {resource.label}
      </Link>
      <h1 className="text-2xl font-semibold">{resource.singular}</h1>
      <DetailScreen
        user={user}
        resource={resource}
        id={p.id}
        users={await listUsers()}
        apiBase={`/api/apps/${app.id}/${resource.id}/${p.id}`}
      />
    </main>
  );
}
