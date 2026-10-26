import { Prisma } from "@prisma/client";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Sign in required") {
    super(401, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Forbidden") {
    super(403, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not found") {
    super(404, message);
  }
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
  }
}

/** Thrown by `repo.mutate()` for a change that `changeApproval` holds; `change-requests.ts` turns it into a request. */
export class ApprovalRequiredError extends ForbiddenError {
  constructor(
    readonly change: { kind: "update" | "delete"; id: string; data: Record<string, unknown> | null; before: Record<string, unknown> },
  ) {
    super("This change needs a second approver: submit it as a change request");
  }
}

/** Unique violation, from Prisma (P2002) or from a raw query in `repo` (P2010 + Postgres 23505). */
export function isUniqueViolation(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return e.code === "P2002" || (e.code === "P2010" && (e.meta as { code?: string } | undefined)?.code === "23505");
}
