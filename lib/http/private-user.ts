export class PrivateApiError extends Error {
  readonly code: "UNAUTHENTICATED" | "FORBIDDEN";
  readonly status: 401 | 403;

  constructor(
    code: "UNAUTHENTICATED" | "FORBIDDEN",
    status: 401 | 403,
  ) {
    super(code);
    this.name = "PrivateApiError";
    this.code = code;
    this.status = status;
  }
}

export function resolvePrivateUser(
  request: Request,
  privateUserId: string,
  requireDispatchHeader = process.env.NODE_ENV === "production",
  authenticatedOwnerId = process.env.PRIVATE_AUTH_USER_ID?.trim() || privateUserId,
): string {
  const authenticatedUserId = request.headers.get("oai-authenticated-user-id");

  if (!authenticatedUserId) {
    if (requireDispatchHeader) {
      throw new PrivateApiError("UNAUTHENTICATED", 401);
    }
    return privateUserId;
  }

  if (authenticatedUserId !== authenticatedOwnerId) {
    throw new PrivateApiError("FORBIDDEN", 403);
  }

  return privateUserId;
}
