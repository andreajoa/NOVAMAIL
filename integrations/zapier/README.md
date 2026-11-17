# NovaMail for Zapier, Make and n8n

**Zapier app (this folder):** instant triggers via REST hooks + actions. Publish privately or publicly:
`npm i -g zapier-platform-cli && npm install && zapier login && zapier register "NovaMail" && zapier push`

**Make / n8n / any automation tool** (no app needed):
- Auth: header `Authorization: Bearer nm_…` · test: `GET /integrations/me`
- Instant trigger: `POST /integrations/subscriptions {"target_url":"<your webhook URL>","event":"order.created"}` → `{id}`; stop with `DELETE /integrations/subscriptions/{id}`
- Sample data for mapping: `GET /integrations/samples/{event}` · all events: `GET /integrations/events`
- Payload: `{"type":"order.created","created_at":"…","data":{…}}`, signed with Standard Webhooks headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`).

Events: contact.created, contact.tagged, contact.unsubscribed, form.submitted, order.created, cart.abandoned, deal.stage_changed, deal.won, deal.lost, email.delivered, email.delivery_delayed, email.bounced, email.held, email.opened, email.clicked, email.complained.
