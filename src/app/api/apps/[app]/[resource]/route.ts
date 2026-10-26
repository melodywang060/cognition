import { formData, readJson, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getResource } from "@/lib/registry";
import { repo } from "@/lib/repo";

export const dynamic = "force-dynamic";

type Params = { app: string; resource: string };

export const GET = route<Params>(async (req, params) => {
  const user = await requireUser(req);
  const { resource } = getResource(params.app, params.resource);
  const q = new URL(req.url).searchParams.get("q") ?? undefined;
  return { rows: await repo.query(user, resource, { search: q }) };
});

export const POST = route<Params>(async (req, params) => {
  const user = await requireUser(req);
  const { resource } = getResource(params.app, params.resource);
  const data = formData(resource, await readJson(req));
  const row = await repo.mutate(user, resource, { kind: "create", data });
  return Response.json({ row }, { status: 201 });
});
