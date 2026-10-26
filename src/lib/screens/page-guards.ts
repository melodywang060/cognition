import { forbidden, notFound, unauthorized } from "next/navigation";
import { getSessionUser } from "../auth";
import { NotFoundError } from "../errors";
import { getResource } from "../registry";
import { hasRole, type Role, type User } from "../roles";

/** Pages return real 401/403/404 responses; the data layer re-checks on every read and write. */
export async function requirePageUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) unauthorized();
  return user;
}

export function requirePageRole(user: User, role: Role | undefined): void {
  if (!role || !hasRole(user.role, role)) forbidden();
}

export function pageResource(appId: string, resourceId: string) {
  try {
    return getResource(appId, resourceId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}
