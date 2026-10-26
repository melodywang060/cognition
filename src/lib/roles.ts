import { ForbiddenError } from "./errors";

export const ROLES = ["agent", "reviewer", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Roles are ordered: admin can do everything a reviewer can, and so on. */
export function hasRole(role: Role, required: Role): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(required);
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export function assertRole(user: User, required: Role | undefined, what: string): void {
  if (!required || !hasRole(user.role, required)) {
    throw new ForbiddenError(`Role "${user.role}" cannot ${what}`);
  }
}
