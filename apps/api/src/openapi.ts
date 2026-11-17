// OpenAPI 3.1 description of the public NovaMail API (served at /openapi.json, rendered at /docs).
const err = { $ref: "#/components/schemas/Error" };
const json = (schema: unknown) => ({ "application/json": { schema } });
const ok = (schema: unknown, description = "OK") => ({ description, content: json(schema) });
const errors = {
  "401": ok(err, "Missing or invalid API key"),
  "403": ok(err, "Forbidden / unverified domain / suspended"),
  "422": ok(err, "Validation error"),
  "429": ok(err, "Plan quota exceeded"),
};
const one = (s: string) => ({ oneOf: [{ type: "string", format: s }, { type: "array", items: { type: "string", format: s }, maxItems: 50 }] });

export function openapi(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "NovaMail API",
      version: "0.1.0",
      description:
        "Transactional email API, compatible with the Resend SDKs (change only the base URL). Authenticate with `Authorization: Bearer nm_…`. Every write accepts an `Idempotency-Key` header.",
    },
    servers: [{ url: serverUrl }],
    security: [{ bearer: [] }],
    tags: [{ name: "Emails" }, { name: "Domains" }, { name: "API keys" }, { name: "Webhooks" }, { name: "Suppressions" }, { name: "Account" }],
    paths: {
      "/emails": {
        post: {
          tags: ["Emails"],
          summary: "Send an email",
          parameters: [{ name: "Idempotency-Key", in: "header", schema: { type: "string" }, description: "Repeated keys return the original email id instead of sending again." }],
          requestBody: { required: true, content: json({ $ref: "#/components/schemas/SendEmail" }) },
          responses: { "200": ok({ type: "object", properties: { id: { type: "string", format: "uuid" } } }), ...errors },
        },
        get: {
          tags: ["Emails"],
          summary: "List emails",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", maximum: 100, default: 50 } },
            { name: "before", in: "query", schema: { type: "string" }, description: "Cursor: email id" },
          ],
          responses: { "200": ok({ type: "object", properties: { object: { const: "list" }, has_more: { type: "boolean" }, data: { type: "array", items: { $ref: "#/components/schemas/Email" } } } }) },
        },
      },
      "/emails/batch": {
        post: {
          tags: ["Emails"],
          summary: "Send up to 100 emails",
          requestBody: { required: true, content: json({ type: "array", maxItems: 100, items: { $ref: "#/components/schemas/SendEmail" } }) },
          responses: { "200": ok({ type: "object", properties: { data: { type: "array", items: { type: "object", properties: { id: { type: "string" } } } } } }), ...errors },
        },
      },
      "/emails/{id}": {
        get: { tags: ["Emails"], summary: "Retrieve an email", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": ok({ $ref: "#/components/schemas/Email" }), "404": ok(err, "Not found") } },
      },
      "/domains": {
        post: {
          tags: ["Domains"],
          summary: "Add a sending domain",
          requestBody: { required: true, content: json({ type: "object", required: ["name"], properties: { name: { type: "string", example: "mail.yourstore.com" } } }) },
          responses: { "201": ok({ $ref: "#/components/schemas/Domain" }), ...errors },
        },
        get: { tags: ["Domains"], summary: "List domains", responses: { "200": ok({ type: "object" }) } },
      },
      "/domains/{id}": {
        get: { tags: ["Domains"], summary: "Retrieve a domain with its DNS records", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": ok({ $ref: "#/components/schemas/Domain" }) } },
        delete: { tags: ["Domains"], summary: "Remove a domain", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": ok({ type: "object" }) } },
      },
      "/domains/{id}/verify": {
        post: { tags: ["Domains"], summary: "Check ownership, SPF, DKIM and return-path", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": ok({ type: "object" }) } },
      },
      "/api-keys": {
        post: {
          tags: ["API keys"],
          summary: "Create an API key (token shown once)",
          requestBody: { content: json({ type: "object", required: ["name"], properties: { name: { type: "string" }, permission: { enum: ["full_access", "sending_access"] }, domain_id: { type: "string" } } }) },
          responses: { "201": ok({ type: "object", properties: { id: { type: "string" }, token: { type: "string" } } }) },
        },
        get: { tags: ["API keys"], summary: "List API keys", responses: { "200": ok({ type: "object" }) } },
      },
      "/api-keys/{id}": { delete: { tags: ["API keys"], summary: "Revoke an API key", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": ok({ type: "object" }) } } },
      "/webhooks": {
        post: {
          tags: ["Webhooks"],
          summary: "Create a webhook endpoint (Standard Webhooks signature)",
          description: "Requests carry `webhook-id`, `webhook-timestamp` and `webhook-signature` (v1, HMAC-SHA256). Verify with any Standard Webhooks / Svix library and the returned `signing_secret`.",
          requestBody: { content: json({ type: "object", required: ["endpoint"], properties: { endpoint: { type: "string", format: "uri" }, events: { type: "array", items: { $ref: "#/components/schemas/EventType" } } } }) },
          responses: { "201": ok({ type: "object" }) },
        },
        get: { tags: ["Webhooks"], summary: "List webhook endpoints", responses: { "200": ok({ type: "object" }) } },
      },
      "/webhooks/{id}": { delete: { tags: ["Webhooks"], summary: "Delete a webhook endpoint", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": ok({ type: "object" }) } } },
      "/suppressions": {
        get: { tags: ["Suppressions"], summary: "List suppressed addresses", responses: { "200": ok({ type: "object" }) } },
        post: { tags: ["Suppressions"], summary: "Suppress an address", requestBody: { content: json({ type: "object", required: ["address"], properties: { address: { type: "string", format: "email" }, reason: { enum: ["manual", "unsubscribe"] } } }) }, responses: { "201": ok({ type: "object" }) } },
      },
      "/suppressions/{address}": { delete: { tags: ["Suppressions"], summary: "Remove from suppression list", parameters: [{ name: "address", in: "path", required: true, schema: { type: "string" } }], responses: { "200": ok({ type: "object" }) } } },
      "/usage": { get: { tags: ["Account"], summary: "Plan, usage and reputation", responses: { "200": ok({ type: "object" }) } } },
    },
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "nm_…" } },
      schemas: {
        Error: { type: "object", properties: { statusCode: { type: "integer" }, name: { type: "string" }, message: { type: "string" } } },
        EventType: { enum: ["*", "email.delivered", "email.delivery_delayed", "email.bounced", "email.held", "email.opened", "email.clicked", "email.complained"] },
        SendEmail: {
          type: "object",
          required: ["from", "to", "subject"],
          properties: {
            from: { type: "string", example: "Store <hi@mail.yourstore.com>" },
            to: one("email"),
            cc: one("email"),
            bcc: one("email"),
            reply_to: one("email"),
            subject: { type: "string", maxLength: 998 },
            html: { type: "string" },
            text: { type: "string" },
            headers: { type: "object", additionalProperties: { type: "string" } },
            tags: { type: "array", maxItems: 10, items: { type: "object", properties: { name: { type: "string" }, value: { type: "string" } } } },
            attachments: { type: "array", maxItems: 20, items: { type: "object", required: ["filename", "content"], properties: { filename: { type: "string" }, content: { type: "string", contentEncoding: "base64" }, content_type: { type: "string" } } } },
          },
        },
        Email: {
          type: "object",
          properties: {
            object: { const: "email" },
            id: { type: "string" },
            from: { type: "string" },
            to: { type: "array", items: { type: "string" } },
            subject: { type: "string" },
            last_event: { enum: ["queued", "delivered", "delayed", "held", "bounced", "opened", "clicked", "complained"] },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Domain: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            status: { enum: ["pending", "verified", "failed"] },
            records: { type: "array", items: { type: "object", properties: { record: { type: "string" }, type: { type: "string" }, name: { type: "string" }, value: { type: "string" }, required: { type: "boolean" } } } },
          },
        },
      },
    },
  };
}

export function docsHtml(specUrl: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NovaMail API reference</title></head>
<body><script id="api-reference" data-url="${specUrl}"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.76.4"></script></body></html>`;
}
