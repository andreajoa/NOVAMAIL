// NovaMail Zapier app. Publish with: npm i -g zapier-platform-cli && zapier login && zapier register "NovaMail" && zapier push
const API = "https://api.novamail.nexaclouds.online";

const authentication = {
  type: "custom",
  fields: [{ key: "api_key", label: "API key", required: true, helpText: "Create one in NovaMail → API keys (starts with nm_)." }],
  test: { url: `${API}/integrations/me` },
  connectionLabel: "{{json.label}}",
};

const addAuth = (request, z, bundle) => {
  request.headers.Authorization = `Bearer ${bundle.authData.api_key}`;
  return request;
};

const TRIGGERS = [
  ["contact_created", "contact.created", "New Contact", "Triggers when a contact is added (API, import, form)."],
  ["contact_tagged", "contact.tagged", "Contact Tagged", "Triggers when a tag is added to a contact."],
  ["contact_unsubscribed", "contact.unsubscribed", "Contact Unsubscribed", "Triggers when someone unsubscribes."],
  ["form_submitted", "form.submitted", "Form Submitted", "Triggers when a signup form is confirmed."],
  ["order_created", "order.created", "New Order", "Triggers when a store order is received (with attribution)."],
  ["cart_abandoned", "cart.abandoned", "Cart Abandoned", "Triggers when a checkout is abandoned."],
  ["deal_won", "deal.won", "Deal Won", "Triggers when a deal moves to a won stage."],
  ["deal_stage_changed", "deal.stage_changed", "Deal Stage Changed", "Triggers when a deal changes stage."],
  ["email_opened", "email.opened", "Email Opened", "Triggers when a person opens an email."],
  ["email_clicked", "email.clicked", "Email Link Clicked", "Triggers when a person clicks a link."],
  ["email_bounced", "email.bounced", "Email Bounced", "Triggers when an email bounces."],
];

const triggers = Object.fromEntries(
  TRIGGERS.map(([key, event, label, description]) => [
    key,
    {
      key,
      noun: label.split(" ")[0],
      display: { label, description },
      operation: {
        type: "hook",
        performSubscribe: async (z, bundle) => (await z.request({ url: `${API}/integrations/subscriptions`, method: "POST", json: { target_url: bundle.targetUrl, event, source: "zapier" } })).data,
        performUnsubscribe: async (z, bundle) => (await z.request({ url: `${API}/integrations/subscriptions/${bundle.subscribeData.id}`, method: "DELETE" })).data,
        perform: (z, bundle) => [{ id: bundle.cleanedRequest["webhook-id"] || `${event}-${Date.now()}`, ...(bundle.cleanedRequest.data || bundle.cleanedRequest) }],
        performList: async (z) => (await z.request({ url: `${API}/integrations/samples/${event}` })).data,
        sample: { id: `sample_${event}` },
      },
    },
  ]),
);

const create = (key, label, description, fields, url, body) => ({
  key,
  noun: label.split(" ").slice(-1)[0],
  display: { label, description },
  operation: { inputFields: fields, perform: async (z, bundle) => (await z.request({ url: `${API}${url}`, method: "POST", json: body(bundle.inputData) })).data, sample: { object: key } },
});

const creates = {
  add_contact: create("add_contact", "Add or Update Contact", "Adds a contact (merges with an existing one).", [
    { key: "email", required: true }, { key: "first_name" }, { key: "last_name" }, { key: "company" }, { key: "phone" },
    { key: "tags", list: true, helpText: "Lowercase tags, e.g. vip" }, { key: "list_id", helpText: "Optional list (aud_…)" },
  ], "/people", (d) => ({ email: d.email, first_name: d.first_name, last_name: d.last_name, company: d.company, phone: d.phone, tags: d.tags, list_id: d.list_id })),
  tag_contact: create("tag_contact", "Tag Contact", "Adds or removes tags (tags can start funnels).", [
    { key: "email", required: true }, { key: "add", list: true }, { key: "remove", list: true },
  ], "/contacts/tags", (d) => ({ email: d.email, add: d.add || [], remove: d.remove || [] })),
  send_email: create("send_email", "Send Email", "Sends a transactional email from a verified domain.", [
    { key: "from", required: true }, { key: "to", required: true }, { key: "subject", required: true }, { key: "html", type: "text" }, { key: "text", type: "text" },
  ], "/emails", (d) => ({ from: d.from, to: d.to, subject: d.subject, html: d.html, text: d.text })),
  create_deal: create("create_deal", "Create Deal", "Creates a deal in the sales pipeline.", [
    { key: "title", required: true }, { key: "email" }, { key: "value", type: "number" }, { key: "currency", default: "USD" },
  ], "/deals", (d) => ({ title: d.title, email: d.email, value_cents: Math.round(Number(d.value || 0) * 100), currency: d.currency || "USD" })),
  create_task: create("create_task", "Create Task", "Creates a CRM task.", [{ key: "title", required: true }, { key: "email" }, { key: "due_at", type: "datetime" }], "/tasks", (d) => ({ title: d.title, email: d.email, due_at: d.due_at ? Date.parse(d.due_at) : undefined })),
  record_order: create("record_order", "Record Order", "Records an order for revenue attribution (custom stores).", [
    { key: "store_id", required: true }, { key: "id", required: true }, { key: "email" }, { key: "total", type: "number", required: true }, { key: "currency", default: "USD" },
  ], "/commerce/orders", (d) => ({ store_id: d.store_id, id: String(d.id), email: d.email, total_cents: Math.round(Number(d.total) * 100), currency: d.currency || "USD" })),
};

module.exports = { version: require("./package.json").version, platformVersion: require("zapier-platform-core").version, authentication, beforeRequest: [addAuth], triggers, creates };
