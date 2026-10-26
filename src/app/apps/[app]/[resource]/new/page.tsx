import { pageResource, requirePageRole, requirePageUser } from "@/lib/screens/page-guards";
import { FormScreen } from "@/lib/screens/FormScreen";
import { notFound } from "next/navigation";

export default async function NewPage({ params }: { params: Promise<{ app: string; resource: string }> }) {
  const p = await params;
  const user = await requirePageUser();
  const { app, resource } = pageResource(p.app, p.resource);
  if (!resource.form) notFound();
  requirePageRole(user, resource.permissions.create);
  const fields = resource.form.fields.map((name) => resource.fields.find((f) => f.name === name)!);
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">New {resource.singular.toLowerCase()}</h1>
      <FormScreen
        fields={fields}
        apiUrl={`/api/apps/${app.id}/${resource.id}`}
        detailBase={`/apps/${app.id}/${resource.id}`}
      />
    </main>
  );
}
