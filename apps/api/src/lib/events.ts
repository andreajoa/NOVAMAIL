// Customer-facing event catalog (webhooks, Zapier/Make REST hooks) with sample payloads.
import type { Env } from "../env";
import { enqueueCustomerEvent } from "./webhooks";

export const EMAIL_EVENTS = ["email.delivered", "email.delivery_delayed", "email.bounced", "email.held", "email.opened", "email.clicked", "email.complained"] as const;
export const APP_EVENTS = ["contact.created", "contact.tagged", "contact.unsubscribed", "form.submitted", "order.created", "cart.abandoned", "deal.stage_changed", "deal.won", "deal.lost"] as const;
export const EVENTS = [...EMAIL_EVENTS, ...APP_EVENTS] as const;
export type EventType = (typeof EVENTS)[number];

const T = "2026-11-17T12:00:00.000Z";
export const SAMPLES: Record<EventType, Record<string, unknown>> = {
  "email.delivered": { email_id: "0193f1c2-aaaa-7bbb-8ccc-000000000001", from: "Store <hello@yourbrand.com>", to: ["ana@example.com"], subject: "Your order shipped" },
  "email.delivery_delayed": { email_id: "0193f1c2-aaaa-7bbb-8ccc-000000000002", to: ["ana@example.com"], subject: "Weekly news", details: "Mailbox temporarily unavailable" },
  "email.bounced": { email_id: "0193f1c2-aaaa-7bbb-8ccc-000000000003", to: ["old@example.com"], subject: "Weekly news", bounce: { type: "hard" } },
  "email.held": { email_id: "0193f1c2-aaaa-7bbb-8ccc-000000000004", to: ["ana@example.com"], subject: "Weekly news" },
  "email.opened": { email_id: "0193f1c2-aaaa-7bbb-8ccc-000000000005", to: ["ana@example.com"], subject: "Black Friday starts now" },
  "email.clicked": { email_id: "0193f1c2-aaaa-7bbb-8ccc-000000000006", to: ["ana@example.com"], subject: "Black Friday starts now", click: { link: "https://yourbrand.com/sale" } },
  "email.complained": { email_id: "0193f1c2-aaaa-7bbb-8ccc-000000000007", to: ["ana@example.com"], subject: "Weekly news" },
  "contact.created": { email: "ana@example.com", first_name: "Ana", last_name: "Rivera", list_id: "aud_example", source: "api", created_at: T },
  "contact.tagged": { email: "ana@example.com", tag: "vip", created_at: T },
  "contact.unsubscribed": { email: "ana@example.com", created_at: T },
  "form.submitted": { form_id: "frm_example", form_name: "Homepage popup", email: "ana@example.com", first_name: "Ana", list_id: "aud_example", double_optin: true, page: "https://yourbrand.com/", created_at: T },
  "order.created": { store_id: "st_example", order_id: "5001", email: "ana@example.com", total: 98.0, currency: "USD", items: [{ title: "Linen Shirt", qty: 2, price: 49.0 }], attributed_campaign: "bc_example", attributed_funnel: null, created_at: T },
  "cart.abandoned": { store_id: "st_example", cart_id: "ck1", email: "ana@example.com", total: 98.0, currency: "USD", checkout_url: "https://yourbrand.com/checkouts/ck1", created_at: T },
  "deal.stage_changed": { deal_id: "deal_example", title: "Annual plan — Corp", email: "lead@corp.com", value: 1000, currency: "USD", from_stage: "proposal", to_stage: "negotiation", created_at: T },
  "deal.won": { deal_id: "deal_example", title: "Annual plan — Corp", email: "lead@corp.com", value: 1000, currency: "USD", created_at: T },
  "deal.lost": { deal_id: "deal_example", title: "Small shop", email: "shop@example.com", value: 200, currency: "USD", created_at: T },
};

/** Fire-and-forget event to the account's webhooks / Zapier / Make subscriptions. */
export async function emit(env: Env, accountId: string, type: EventType, data: Record<string, unknown>) {
  try { await enqueueCustomerEvent(env, accountId, type, { ...data, created_at: new Date().toISOString() }); }
  catch (e) { console.log(JSON.stringify({ level: "error", emit: type, error: String(e).slice(0, 200) })); }
}
