import { Prisma } from "@prisma/client";
import { HttpError } from "./errors";
import type { ResourceConfig } from "./types";

type Handler<P> = (req: Request, params: P) => Promise<unknown>;

/** Wraps a route handler: maps HttpErrors (403, 404, ...) to JSON error responses. */
export function route<P extends Record<string, string> = Record<string, never>>(fn: Handler<P>) {
  return async (req: Request, ctx: { params: Promise<P> }): Promise<Response> => {
    try {
      const result = await fn(req, await ctx.params);
      return result instanceof Response ? result : Response.json(result);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return Response.json({ error: "Duplicate" }, { status: 409 });
      }
      console.error(e);
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {}
  throw new HttpError(400, "Body must be a JSON object");
}

/** Only fields on the resource's form are writable through the API. */
export function formData(resource: ResourceConfig, body: Record<string, unknown>): Record<string, unknown> {
  const allowed = resource.form?.fields ?? [];
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) throw new HttpError(400, `Field "${key}" is not writable`);
  }
  return body;
}
