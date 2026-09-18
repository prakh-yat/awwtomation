# Awwtomation

Multi-tenant comment-to-DM automation for Instagram and Facebook — a self-hostable ManyChat alternative built on the official Meta APIs.

Someone comments `LINK` on a reel → they get a DM with your link a second later. Add a public reply, gate the link behind a follow, continue the conversation with buttons, track every click, and run it for as many client accounts as your plan allows.

## What's inside

| Area | What it does |
|---|---|
| **Dashboard & analytics** | Daily overview (trend against the previous period, what needs attention, plan usage, top automations, latest conversations) and a full analytics report: people funnel, busiest times, keywords, per-account and per-automation tables, CSV export. |
| **Automations** | Keyword / any-comment / DM / story-reply triggers on specific posts or all posts. Visual flow builder (React Flow): Trigger → Message (up to 3 buttons) → Ask a question → Follow gate → Delay → Tag → Add to pipeline / Move stage / Remove from pipeline. New automations open on an empty canvas; templates are one click away. Public reply variants. Once-per-contact. Templates. Per-automation analytics. |
| **Inbox** | Unified Instagram + Messenger live chat. 24-hour window indicator, human-agent 7-day mode, assignment, automated-message badges, link buttons. |
| **Contacts (CRM)** | Everyone who interacted, plus people added by hand or CSV import. Paginated list. **Pipelines**: as many as you need per workspace, each with its own coloured stages; view all contacts or one pipeline (stage tabs, list or drag-and-drop board). Owners, notes, tags, custom fields, follower status, opt-out, activity timeline, bulk stage/owner/tag changes, CSV import (into a pipeline) and export. **Segments**: saved filters (account, tags all/any, pipeline and stage, owner, source, followers, last activity, opt-out) that broadcasts can target. |
| **Broadcasts** | Send to a tagged audience — only contacts inside Meta's 24h window are eligible, and the UI shows the live count. Scheduling. |
| **Channels** | Connect Instagram professional accounts (Instagram Login) and Facebook Pages (Facebook Login). Token health, webhook status, post cache. *Disconnect* keeps history; **Delete channel & data** (owner only) purges the channel and everything under it — the same cascade Meta's data-deletion callback runs. |
| **Tracked links** | `/l/{slug}` redirects with click attribution to contact + automation. |
| **Logs** | Every send, skip and failure with a plain-English reason (the raw Meta response stays in the database and server logs). |
| **Organizations, workspaces & team** | An organization is the billable account: it holds the plan, the team (Owner / Admin / Member) and any number of workspaces (brands or clients). Switch or create organizations from the account menu, switch workspaces from the sidebar. Invite links. |
| **Plans & usage** | FREE / STARTER / PRO / AGENCY with DM, channel, automation and seat caps enforced server-side. **Billing** through Dodo Payments (monthly/annual checkout, portal, plan changes, webhooks, reconciliation) — see [docs/BILLING.md](docs/BILLING.md). |
| **Marketing site** | Landing, pricing, privacy, terms, data-deletion (required for Meta App Review). |

Branding is pure black & white; the product name lives in `lib/brand.ts`.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind + shadcn-style UI · Prisma 6 + Postgres · Google OAuth (PKCE, in-app) · Postgres-backed job queue + worker · React Flow · Recharts.

## Quick start

Local, no accounts needed (embedded Postgres + dev sign-in bypass):

```bash
cp .env.example .env        # keep the "Local development" block: DATABASE_URL on 127.0.0.1:5433 + DEV_AUTH_EMAIL=you@example.com
npm install
npm run db:local            # terminal 1 — embedded Postgres (PGlite), data in .local-db/
npx prisma db push          # create the tables
npm run db:seed             # demo organizations and workspaces with channels, contacts, pipelines, logs, analytics
npm run dev                 # http://localhost:3000 — signed in as DEV_AUTH_EMAIL
npm run worker              # terminal 2 — sends the DMs
```

With real Google + Meta credentials, drop `DEV_AUTH_EMAIL`, point `DATABASE_URL`/`DIRECT_URL` at your Postgres and use `npx prisma migrate deploy`. `npm run check-env` prints every variable (masked) and flags missing ones.

Full setup (Google sign-in, Meta app, webhooks, going live): **[docs/SETUP.md](docs/SETUP.md)**.
Deploying (Vercel + Railway worker, Docker Compose on a VPS, Railway all-in-one): **[docs/DEPLOY.md](docs/DEPLOY.md)**.
Billing with Dodo Payments: **[docs/BILLING.md](docs/BILLING.md)**.
Meta App Review pack: **[docs/META_APP_REVIEW.md](docs/META_APP_REVIEW.md)**.
Architecture and code contracts: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | yes | Public https URL. OAuth redirect + webhook URLs derive from it. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes | Google Cloud OAuth client (Web application). Authorized redirect URI: `<NEXT_PUBLIC_APP_URL>/auth/callback`. |
| `DATABASE_URL`, `DIRECT_URL` | yes | Pooled (6543) and direct (5432) Postgres URLs. |
| `APP_ENCRYPTION_KEY` | yes | `openssl rand -base64 32` — encrypts Meta tokens. |
| `CRON_SECRET` | yes | Protects `/api/cron/*`. |
| `META_APP_ID`, `META_APP_SECRET` | for Facebook + webhooks | Facebook app credentials. |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | for Instagram | Instagram Login product credentials (different from the app id). |
| `META_WEBHOOK_VERIFY_TOKEN` | yes | Any string; paste the same into Meta's webhook config. |
| `META_GRAPH_API_VERSION` | no | Defaults to `v25.0`. |
| `RESEND_API_KEY`, `EMAIL_FROM` | no | Invites work as links without email. |
| `DODO_MODE`, `DODO_SECRET_KEY`, `DODO_WEBHOOK_SECRET`, `DODO_PRODUCT_*` | to charge money | Dodo Payments; without them every organization stays on FREE. |
| `DEV_AUTH_EMAIL` | dev only | Sign in as this email without Google. Ignored unless `NODE_ENV=development`. |

`NEXT_PUBLIC_*` values are inlined at build time — change them and rebuild.

## How a comment becomes a DM

1. Meta POSTs the comment to `/api/webhooks/meta` (signature verified, event deduped).
2. The engine matches the comment against ACTIVE automations on that channel (keywords, post filter, once-per-contact, not the account's own comment).
3. A flow session is created and an `EXECUTE_FLOW` job is queued (plus `PUBLIC_REPLY` if enabled).
4. The worker checks the plan quota and the 750/hour private-reply limit, sends the first message as a **private reply** to the comment, logs it, and pauses the flow.
5. When the person taps a button or replies, the webhook resumes the flow inside the 24-hour window.
6. A 5-minute reconciliation poll catches any comment Meta didn't deliver.

## Meta rules baked in

One private reply per comment (7-day limit) · 750 private replies / hour / account · follow-ups only inside the 24h window (7 days with `HUMAN_AGENT`, humans only) · ≤ 1000-byte text, ≤ 3 buttons, ≤ 20-char button titles · tokens encrypted at rest, refreshed before the 60-day expiry, wiped on disconnect / deauthorize.

## Production layout

- **Web**: any Node 20 host (Vercel, Railway, Render, Fly) or the `Dockerfile` (standalone Next.js, non-root, health-checked).
- **Worker**: `npm run worker` as a background service (Docker target `worker`). No worker? Cron `GET /api/cron/tick` every minute with `Authorization: Bearer $CRON_SECRET` or `?token=`.
- **Cron safety nets**: `/api/cron/refresh-tokens` daily, `/api/cron/reconcile` every 5 min (`vercel.json` declares all three).
- **Health**: `GET /api/health` → db latency, worker heartbeat, which integrations are configured; 503 only when the database is down.
- **Ready-made configs**: `docker-compose.yml` (Postgres + web + worker + optional Caddy HTTPS), `railway.json` / `railway.worker.json`, `render.yaml`, `vercel.json`, `.github/workflows/ci.yml` (typecheck, lint, build, migration drift, Docker build).

Step-by-step: **[docs/DEPLOY.md](docs/DEPLOY.md)**.

## License

MIT
