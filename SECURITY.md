# Security

Awwtomation is a multi-tenant SaaS that holds Meta access tokens and the private
conversations of our customers' audiences. This document is the threat model we
build against, what the code does about each threat, how to report a problem,
and what must be true before a deployment goes live.

Reporting: email **security@awwtomation.com** (fallback: support@awwtomation.com)
with steps to reproduce. Please do not open a public issue for anything
exploitable. We acknowledge reports within two business days.

## Threat model (summary)

| Threat | Why it matters here |
|---|---|
| Cross-tenant data access | One database serves every workspace; a missing `workspaceId` filter leaks another customer's contacts/messages. |
| Stolen or misused Meta tokens | A token lets an attacker DM a business's audience as the business. |
| Forged webhooks / callbacks | `/api/webhooks/meta`, `/api/meta/deauthorize`, `/api/meta/data-deletion` are unauthenticated by design. |
| CSRF against cookie-authenticated APIs | Every `app/api/*` mutation is authorised by a session cookie. |
| XSS / clickjacking | The app renders user-supplied text (comments, captions, DMs) everywhere. |
| Abuse of public endpoints | Tracked-link redirects and webhook ingestion are open to the internet and hit the database. |
| Privilege escalation inside a workspace | MEMBER → ADMIN → OWNER. There is no cross-tenant admin UI. |
| Secrets in logs / error messages | Tokens, cookies and webhook secrets must never reach a log drain. |

## What is protected, and how

**Tenant isolation.** Every `lib/services/*` function takes `workspaceId` first
and scopes every Prisma query by it (or by a relation loaded that way). Route
handlers only ever obtain `workspaceId` from the server-side workspace context
(`lib/workspace/context.ts`), never from the request body. There is no
cross-tenant page or API: operator tasks such as comping a plan run from the
command line (`scripts/set-plan.ts`) with direct database access.

**Authentication and roles.** Sign-in is Google OAuth 2.0 with PKCE, handled by
the app itself (`lib/auth/google.ts`, `app/auth/google`, `app/auth/callback`);
the `state` and code verifier live in a short-lived httpOnly cookie and the code
exchange happens server-side. The session is an HMAC-SHA256-signed cookie
(`lib/auth/token.ts`, keyed by `APP_ENCRYPTION_KEY`) whose signature and expiry
the middleware verifies on every protected page. Roles are OWNER > ADMIN > MEMBER (`lib/workspace/permissions.ts`).
Route handlers declare `minRole` in `withWorkspace(...)` or enforce it in the
service (`assertMembership`); the audit table in the security lane's report lists
every route with its wrapper and role. Channels, team, settings and billing are
ADMIN+; deleting a workspace, transferring ownership and purging a channel are
OWNER only.

**CSRF.** `withWorkspace` / `withUser` (`lib/workspace/api.ts`) reject any
non-GET/HEAD/OPTIONS request unless `Sec-Fetch-Site` is `same-origin`/`none` or
the `Origin` host matches `NEXT_PUBLIC_APP_URL` / the request host
(`lib/security/csrf.ts`). Server Actions are covered by Next.js' own origin check.
All app cookies are `SameSite=Lax`, `Secure` in production, and `httpOnly`.

**Browser hardening.** `next.config.ts` sets on every response: a
Content-Security-Policy (self + Graph API + Dodo checkout only;
`frame-ancestors 'none'`; `unsafe-eval` only in development), `X-Frame-Options:
DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy` (camera/microphone/
geolocation off) and, in production, HSTS with preload. `X-Powered-By` is off.
`/robots.txt` keeps crawlers out of the app and API paths.

**Encryption at rest.** Meta access tokens are AES-256-GCM encrypted with
`APP_ENCRYPTION_KEY` before they touch the database (`lib/crypto.ts`); the
Facebook page-picker cookie carries the user token encrypted *and* HMAC-signed.
Disconnecting a channel overwrites the ciphertext with a revoked placeholder.

**Webhook and callback verification.** Meta webhooks are verified against
`X-Hub-Signature-256` with both `META_APP_SECRET` and `INSTAGRAM_APP_SECRET`
using a constant-time compare; unsigned payloads are accepted only in
development. Deauthorize and data-deletion callbacks verify Meta's
`signed_request` HMAC the same way. Bodies above 1 MB are rejected before
parsing. Cron routes require `Authorization: Bearer CRON_SECRET`. Billing
webhooks verify the provider's signature (see the billing lane).

**OAuth.** The `state` parameter is HMAC-signed, expires after 15 minutes, and
binds the workspace, user and platform. A nonce inside it must match an
`httpOnly` cookie set by the start route (constant-time compare); the cookie is
cleared on every callback outcome so a state can't be replayed. The callback
additionally re-checks that the signed-in user is the one who started the flow
and is ADMIN+ in that workspace. Error text forwarded to the UI is sanitised and
capped.

**Rate limits.** `lib/security/rate-limit-ip.ts`: in-memory sliding window,
per instance: Meta webhooks 600/min/IP, tracked links 120/min/IP, OAuth starts
20/min/IP, inbox sends 60/min/user, broadcast sends 10/min/user. Meta's own
send quotas (750 private replies/hour/account) are enforced in Postgres by
`lib/rate-limit.ts`. Swap the in-memory store for Redis/Upstash before running
more than one web instance.

**Logging hygiene.** `lib/logger.ts` emits JSON lines and redacts any value
whose key matches `/token|secret|password|authorization|cookie|access_token/i`
(recursively, four levels deep) before serialising. Never log request headers
or raw cookies.

**Development auth gate.** `DEV_AUTH_EMAIL` signs every request in as that user
without Google. It is hard-gated on `NODE_ENV === "development"`
(`lib/auth/dev.ts`), so it is inert in `next build`/`next start` even if the
variable leaks into a production environment.

**Honest deletion.** Disconnect keeps data for reconnection; "Delete channel &
data" (OWNER) and Meta's data-deletion callback run a full cascade including
queued jobs and raw webhook receipts; workspace deletion cascades everything.
`/data-deletion` describes exactly this and shows the status for a Meta
confirmation code.

## Known limitations

- Rate limits and CSRF origin checks trust `x-forwarded-*` headers; run behind a
  proxy that overwrites them (Vercel, Railway, Cloudflare, nginx with
  `proxy_set_header`).
- The in-memory rate limiter is per process. Horizontal scaling multiplies every
  budget by the instance count until it is moved to a shared store.
- Raw webhook receipts have no channel foreign key; purge matches them by text.
  A receipt that references neither the account id nor a cached post id (rare;
  e.g. a comment on a post older than the media cache) is not removed until a
  retention job exists.
- The CSP allows `'unsafe-inline'` for scripts and styles because Next.js and
  the UI libraries emit inline code; moving to nonces is future work.

## Before you go live

- [ ] Rotate **every** secret that was ever pasted into a chat, ticket, screenshot
      or `.env` shared outside the deployment: `APP_ENCRYPTION_KEY` (re-encrypt
      or reconnect channels), `META_APP_SECRET`, `INSTAGRAM_APP_SECRET`,
      `META_WEBHOOK_VERIFY_TOKEN`, `CRON_SECRET`, `DODO_SECRET_KEY`,
      `DODO_WEBHOOK_SECRET`, `RESEND_API_KEY`, `GOOGLE_CLIENT_SECRET` (rotating it
      also invalidates nothing already signed in: rotate `APP_ENCRYPTION_KEY` to
      force every session to end), and any database credentials.
- [ ] Serve exclusively over HTTPS with `NEXT_PUBLIC_APP_URL` set to the public
      `https://` origin (cookies are `Secure`, HSTS preload is on, and the CSRF
      check compares against this host).
- [ ] Confirm `NODE_ENV=production` on the host and that `DEV_AUTH_EMAIL` is not
      set anywhere in production configuration.
- [ ] Register the Meta redirect URIs, webhook URL, deauthorize and data-deletion
      callbacks with the production domain only; remove localhost/ngrok entries.
- [ ] On the Google OAuth client, list only the production
      `https://<domain>/auth/callback` as an authorized redirect URI; remove the
      localhost entry once you no longer develop against that client.
- [ ] Restrict database access to the app and worker (Supabase: keep RLS enabled
      on any table exposed through PostgREST; the app uses Prisma over a private
      connection string).
- [ ] Point log drains at a store with access controls; logs contain workspace
      and user ids even though secrets are redacted.
- [ ] Verify the security headers on the live domain
      (`curl -sI https://<domain>/ | grep -iE 'content-security|strict-transport|x-frame'`).
- [ ] Move rate limiting to Redis/Upstash before scaling past one web instance.
- [ ] Schedule a retention job for `WebhookEvent` and `BillingEvent` rows so raw
      payloads do not accumulate indefinitely.
