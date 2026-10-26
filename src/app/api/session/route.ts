import { findUser, sessionCookie } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";

/** User switcher (auth stub). */
export const POST = route(async (req) => {
  const { userId } = await readJson(req);
  const user = await findUser(typeof userId === "string" ? userId : null);
  if (!user) throw new NotFoundError("Unknown user");
  return Response.json({ user }, { headers: { "Set-Cookie": sessionCookie(user.id) } });
});
