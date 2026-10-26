import { formData, readJson, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { getResource } from "@/lib/registry";
import { repo } from "@/lib/repo";

export const dynamic = "force-dynamic";

type Params = { app: string; resource: string; id: string };

export const GET = route<Params>(async (req, params) => {
  const user = await requireUser(req);
  const { resource } = getResource(params.app, params.resource);
  const row = await repo.get(user, resource, params.id);
  if (!row) throw new NotFoundError();
  return { row };
});

export const PATCH = route<Params>(async (req, params) => {
  const user = await requireUser(req);
  const { resource } = getResource(params.app, params.resource);
  const data = formData(resource, await readJson(req));
  return { row: await repo.mutate(user, resource, { kind: "update", id: params.id, data }) };
});
