import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodError } from "zod";

// Error body mirrors Resend's shape so existing SDKs surface messages correctly.
export class ApiError extends Error {
  constructor(readonly status: ContentfulStatusCode, readonly name: string, message: string) {
    super(message);
  }
}

export const errors = {
  unauthorized: () => new ApiError(401, "missing_api_key", "Missing or invalid API key. Send `Authorization: Bearer nm_...`."),
  forbidden: (m = "This API key is not allowed to perform this action.") => new ApiError(403, "restricted_api_key", m),
  notFound: (what: string) => new ApiError(404, "not_found", `${what} not found.`),
  validation: (m: string) => new ApiError(422, "validation_error", m),
  quota: (m: string) => new ApiError(429, "quota_exceeded", m),
  suspended: (r: string | null) => new ApiError(403, "account_suspended", `Account suspended${r ? `: ${r}` : ""}. Contact support.`),
  conflict: (m: string) => new ApiError(409, "conflict", m),
};

export function zodMessage(e: ZodError): string {
  return e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
}

export function sendError(c: Context, e: ApiError) {
  return c.json({ statusCode: e.status, name: e.name, message: e.message }, e.status);
}
