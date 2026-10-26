import { cookies } from "next/headers";
import { prisma } from "./db";
import { UnauthorizedError } from "./errors";
import type { User } from "./roles";

/**
 * Auth stub: the current user is whoever the `uid` cookie names (set by the user switcher).
 * This module is the only place that changes when swapping in Entra ID via OIDC:
 * resolve the user from the OIDC session instead of the cookie, and map groups to roles.
 */

export const USER_COOKIE = "uid";

export async function findUser(id: string | undefined | null): Promise<User | null> {
  if (!id) return null;
  return prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true } });
}

export function listUsers(): Promise<User[]> {
  return prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}

function readCookie(header: string | null, name: string): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** For route handlers. */
export async function requireUser(req: Request): Promise<User> {
  const user = await findUser(readCookie(req.headers.get("cookie"), USER_COOKIE));
  if (!user) throw new UnauthorizedError();
  return user;
}

/** For server components and server actions. */
export async function getSessionUser(): Promise<User | null> {
  return findUser((await cookies()).get(USER_COOKIE)?.value);
}

export function sessionCookie(userId: string): string {
  return `${USER_COOKIE}=${encodeURIComponent(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
}
