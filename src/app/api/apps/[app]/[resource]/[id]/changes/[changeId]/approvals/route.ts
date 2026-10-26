import { readJson, route } from "@/lib/api";
import type { Decision } from "@/lib/approvals";
import { requireUser } from "@/lib/auth";
import { decideChange } from "@/lib/change-requests";
import { getResource } from "@/lib/registry";

export const dynamic = "force-dynamic";

type Params = { app: string; resource: string; id: string; changeId: string };

/** Body: { decision: "approve" | "deny", reason?: string }. Approving applies the change. */
export const POST = route<Params>(async (req, params) => {
  const user = await requireUser(req);
  const { resource } = getResource(params.app, params.resource);
  const { decision, reason } = await readJson(req);
  return decideChange(user, resource, params.id, params.changeId, decision as Decision, typeof reason === "string" ? reason : undefined);
});
