import { readJson, route } from "@/lib/api";
import { decide, type Decision } from "@/lib/approvals";
import { requireUser } from "@/lib/auth";
import { getResource } from "@/lib/registry";

export const dynamic = "force-dynamic";

type Params = { app: string; resource: string; id: string };

/** Body: { decision: "approve" | "deny", reason?: string } */
export const POST = route<Params>(async (req, params) => {
  const user = await requireUser(req);
  const { resource } = getResource(params.app, params.resource);
  const { decision, reason } = await readJson(req);
  return decide(user, resource, params.id, decision as Decision, typeof reason === "string" ? reason : undefined);
});
