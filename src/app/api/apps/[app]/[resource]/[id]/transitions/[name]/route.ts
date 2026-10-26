import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getResource } from "@/lib/registry";
import { applyTransition } from "@/lib/transitions";

export const dynamic = "force-dynamic";

type Params = { app: string; resource: string; id: string; name: string };

export const POST = route<Params>(async (req, params) => {
  const user = await requireUser(req);
  const { resource } = getResource(params.app, params.resource);
  return { row: await applyTransition(user, resource, params.id, params.name) };
});
