# HGM Group – Client Billing Portal: implementation contract

Status: PARTIALLY IMPLEMENTED. See STATUS.md for the current verified state, dependencies and tests. The remaining sections are the original implementation contract, not a claim of completion.

## Existing checkout identifiers
One-time activation: https://www.paypal.com/ncp/payment/W7CJZSQGXF464 (verify in PayPal before considering payment completed).
Monthly PayPal plan ID: P-5SD11848RB0454849NLUV7CA
Checkout source: pagos.html

## Product and customer experience
- Client portal: /clientes with invitation-based sign-up, email verification, password reset, accessible account settings, list of sites, service terms, invoices, renewal dates, payment status, and safe links to manage subscriptions in PayPal.
- Owner portal: /admin/clientes to provision clients, associate only client-owned sites, configure billing schedule, review payment history, manually override payment status only with audit log, pause/resume service, review disputes and exceptions.
- Automatic invitation sends customer to portal, not to editable Sheets.
- Activation payment and monthly subscription are separate. Neither frontend callback nor an unverified return URL demonstrates receipt of money.
- Never store card numbers, PayPal client secrets, or unverified auth claims in the browser.

## Google Workspace ledger (private server access only)
Recommended authenticated Google identity provider + protected Google Sheet, with tabs:
Clients(client_id, email, name, created_at, status, auth_user_id)
Sites(site_id, client_id, hostname, vercel_project_id, managed_by_hgm, suspension_enabled, status)
Subscriptions(subscription_id, client_id, site_id, paypal_subscription_id, paypal_plan_id, due_at, paid_through_at, grace_expires_at, state, last_verified_at)
Invoices(invoice_id, client_id, amount, currency, due_at, state, paypal_reference)
Payments(payment_id, paypal_event_id, subscription_id, amount, occurred_at, verified_at, status)
Audit(event_id, entity_type, entity_id, actor, event, timestamp, reason)
WebhookEvents(paypal_event_id, processed_at, result)
Notifications(notification_id, client_id, template, sent_at, delivery_status)
Do not make spreadsheet public; all access is mediated by authenticated API.

## Backend contracts
POST /api/paypal/webhook: verify PayPal signature via official verify-webhook-signature endpoint and configured webhook ID; reject invalid signatures; deduplicate event IDs; queue processing with audit logs. Handle PAYMENT.SALE.COMPLETED, PAYMENT.SALE.REFUNDED, PAYMENT.SALE.REVERSED, BILLING.SUBSCRIPTION.ACTIVATED, BILLING.SUBSCRIPTION.PAYMENT.FAILED, BILLING.SUBSCRIPTION.CANCELLED, BILLING.SUBSCRIPTION.SUSPENDED, BILLING.SUBSCRIPTION.EXPIRED.
GET /api/account: validate customer identity and require record ownership; never accept a client_id submitted alone.
POST /api/subscriptions/link: authenticated only; verify subscription ID with PayPal server-to-server and confirm plan ID and owner before attaching it to site. The onApprove Javascript callback is UX feedback, not proof of payment.
POST /api/cron/reconcile: protected scheduled trigger. Fetch subscription status and last successful paid period from PayPal, reconcile ledger and outstanding amounts, notify overdue customers; suspend only eligible HGM-managed sites whose billing grace elapsed.
POST /api/admin/sites/:id/suspend and /resume: admin role + audit records + explicit managed-site allowlist, idempotent.
POST /api/cron/notify: protected scheduled trigger, transactional email sender.

## States and timing
pending_activation -> active only when initial activation terms and first subscription/payment criteria are verified.
active -> grace on an unpaid renewal due, without assuming PayPal failed solely because a webhook is late.
grace -> active if verified payment clears outstanding obligation.
grace -> suspended only after 5 complete 24-hour periods from contractual due time, confirmed non-payment, successful notifications, no open dispute or approved extension.
suspended -> active only after server-side verified settlement and technical restoration.
cancelled -> per agreement; do not interpret cancellation of PayPal agreement as permission to delete customer files or domains.
review_required: webhook outage, stale PayPal API, ambiguous transaction, wrong site association, chargeback/dispute, identity mismatch, API failure. DO NOT auto-suspend from review_required.
For notices: overdue at day 0, reminder day 2, final warning day 4, suspension after end of day 5. Operational failures defer suspension; never fail closed.
Use UTC to calculate exact deadlines, display customer-local dates and times.

## Suspension safety
- Never delete a website, backups, domains or email, or shut off shared hosting.
- Suspend only isolated, explicitly enrolled website projects using a reversible maintenance/billing gate.
- Preserve access to the customer portal, account support, receipts, and a clear payment path.
- An HGM admin can override; all actions have timestamps and a reason.
- Reactivate after PayPal payment validation and health check.
- Require clients to accept billing, notice, suspension, data retention, and cancellation terms before enabling automation.

## Prerequisites currently missing
1. Ability to deploy the actual Vercel project: deployment attempts returned 403. Current repo is not verified as linked to production.
2. An authenticated client identity provider, with configured application credentials and allowed origins.
3. Private Google Sheets ledger and server-side credentials.
4. PayPal REST application credentials and registered live webhook ID for the app used by the button (webhook app matching matters).
5. Transactional email service domain verification and sender configuration.
6. An HGM-managed site-only, reversible suspension mechanism deployed to every website to be enrolled.
7. End-to-end PayPal Sandbox and production smoke tests (success, failure, late payment, cancellation, refund, webhook duplicate, PayPal outage).
No automatic suspensions or real customer logins should be enabled before these checks pass.

Sources:
- https://developer.paypal.com/subscriptions/webhooks/
- https://developer.paypal.com/subscriptions/payment-failure-retry/
- https://developer.paypal.com/api/rest/webhooks/
