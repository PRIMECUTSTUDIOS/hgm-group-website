# HGM client controls — 2026-11-03

Implementation is incomplete and is not approved for live automated suspensions.

## Implemented in this revision

- Three independent controls per assigned site: manual suspension, billing exemption, automatic-suspension enrollment.
- Manual suspension cannot be lifted by a payment, exemption, webhook or cron. Only a verified administrator can request resume.
- HGM main project is protected by exact ID. Inventory entries marked PROTECTED or SHARED are also protected.
- Changes require a reason, optimistic version and, for suspension, explicit project confirmation. Audit records contain actor, time, before/after policy, request ID and outcome.
- Control gateway calls Vercel's official pause/unpause APIs while holding Google Apps Script's ScriptLock. Requests use HMAC, a two-minute timestamp window and replay detection. Failures retain the manual lock and report that provider state requires review.
- Exemption changes do not cancel PayPal subscriptions. The panel warns when an exempt site still has a linked subscription.
- Controls stay disabled when their backend is not configured. No fake clients or simulated project cards are shown.
- Public monthly-payment entry now goes through the account portal rather than creating an unassigned subscription. Activation remains a separate PayPal payment link.
- Administrative entry route: `/admin/clientes`; server authorization is required for all admin data and actions.
- Automatic pause/resume is blocked in code pending real end-to-end testing, even if `HGM_AUTO_SUSPEND=true` is accidentally set.

## Deployment and configuration findings

Existing repository: PRIMECUTSTUDIOS/hgm-group-website, main.
Existing Vercel project: hgm-group, prj_7HBdNvapbweuPds58wQM4XgUo6zK, HGM Group / bdg-dev.
Previous observed production deployment: dpl_FuVV98VSbA7a8eneuGgtgfk8nHVF, source f2d81b2017a56e671815c0c5b36735032a9aa036.
The existing project was connected to PRIMECUTSTUDIOS/hgm-group-website through the Vercel Git settings. The Vercel browser session can open the project; the connector returns project-not-found and needs its separate team access grant.
The Vercel UI showed only HGM_ADMIN_EMAILS, HGM_VERCEL_TEAM_ID, HGM_BILLING_SHEET_ID, HGM_AUTO_SUSPEND, HGM_SUSPEND_PROJECT_IDS and PAYPAL_MODE. Provider credentials were absent; no secret values were revealed.
The Google master ledger exists, with no client or site assignments at inspection. No client records or project ownership assignments were invented.

## Still blocked / unverified

- Google OAuth client configuration, server identity and sheet permission; real login/logout/access recovery.
- Apps Script gateway deployment and owner consent; configure HGM_CONTROL_GATEWAY_URL and HGM_CONTROL_GATEWAY_SECRET in Vercel. Gateway script properties need that same secret, HGM_ADMIN_EMAILS, HGM_BILLING_SHEET_ID, HGM_VERCEL_TEAM_ID and VERCEL_API_TOKEN. These are never checked into source.
- The complete Apps Script source is control-gateway.gs, assembled from site-policy.js and control-gateway-body.js. Its first authorized control request adds required control/audit columns without deleting existing columns. Do not deploy multiple independent gateways against the same ledger: they would have separate locks.
- Gateway verification currently uses Vercel's successful API response, not a subsequent visitor HTTP health check. Native pause shows Vercel's 503 DEPLOYMENT_PAUSED page; a branded suspension page is not implemented.
- PayPal REST live and Sandbox credentials, matching webhook registration and concurrent event idempotency. Existing webhook and subscription writes still require a transactional processing path; the gateway currently serializes only manual controls.
- First-payment/activation reconciliation, full renewal/refund/dispute handling, protection against concurrent duplicate subscription creation, billing history and cancellation UI remain incomplete.
- Verified mail sender, all notification templates, delivery callbacks and deduplication remain incomplete.
- Invitations, contracts, extensions and support/account profile flows are not complete.
- Isolated Vercel pause/resume, real Sandbox transactions, provider outages, email delivery, desktop and mobile end-to-end scenarios have not been executed.
- No live automatic suspension release until all required scenarios pass and eligible sites have recorded contractual consent.

## Local verification

Run `node --test billing-system/*.test.js` and syntax-check the API files and inline browser scripts. Tests use isolated in-memory providers and never charge customers or pause a real site. A local passing result does not establish production readiness.

## References

- https://vercel.com/docs/projects/managing-projects
- https://developers.google.com/apps-script/reference/lock/lock-service
- https://developers.google.com/apps-script/reference/utilities/utilities
