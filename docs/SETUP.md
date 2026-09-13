# Setup guide

Awwtomation is a multi-tenant SaaS. You deploy **one** instance, register **one** Meta app, and every customer connects their own Instagram / Facebook accounts into it through OAuth.

Two processes run in production:

| Process | Command | What it does |
|---|---|---|
| Web | `npm run build && npm start` | Dashboard, API, Meta webhooks, OAuth |
| Worker | `npm run worker` | Sends DMs, public replies, broadcasts; refreshes tokens; polls comments as a safety net |

If you can't run a second process (e.g. Vercel only), point a cron at `GET /api/cron/tick` every minute with `Authorization: Bearer $CRON_SECRET` (or `?token=$CRON_SECRET`) — it processes the queue in batches.

`GET /api/health` reports database, worker and integration status for both. Hosting recipes (Vercel + Railway, Docker Compose on a VPS, Railway all-in-one) live in **[docs/DEPLOY.md](DEPLOY.md)**; billing setup in **[docs/BILLING.md](BILLING.md)**.

## 1. Supabase

1. Create a project at supabase.com.
2. **Authentication → Providers → Google** → enable. Paste a Google OAuth client id/secret (Google Cloud Console → APIs & Services → Credentials → OAuth client → Web application). Authorized redirect URI: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`.
3. **Authentication → URL Configuration**: Site URL = your `NEXT_PUBLIC_APP_URL`; add `http://localhost:3000/**` and `https://yourdomain.com/**` to Redirect URLs.
4. **Project Settings → API**: copy `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. **Project Settings → Database**: copy the pooled (6543) URL into `DATABASE_URL` and the direct (5432) URL into `DIRECT_URL`.

## 2. Database

```bash
cp .env.example .env    # fill in the values
npm install
npm run check-env       # table of every variable, masked — exits 1 if a required one is missing
npx prisma migrate deploy   # applies prisma/migrations (production and local alike)
# schema change during development: npx prisma migrate dev --name <what-changed>
```

## 3. Meta app

Create one app at developers.facebook.com (type **Business**).

### Instagram (Instagram API with Instagram Login)
1. Add the **Instagram** product → *API setup with Instagram login*.
2. Copy **Instagram app ID / secret** → `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`.
3. Business login settings → OAuth redirect URI: `https://yourdomain.com/api/meta/instagram/callback`. Also add the deauthorize URL `https://yourdomain.com/api/meta/deauthorize` and data-deletion URL `https://yourdomain.com/api/meta/data-deletion`.
4. Webhooks (under the Instagram product): callback `https://yourdomain.com/api/webhooks/meta`, verify token = `META_WEBHOOK_VERIFY_TOKEN`. Subscribe to `comments`, `messages`, `messaging_postbacks`, `live_comments`.

### Facebook Pages + Messenger
1. Add **Facebook Login for Business** and **Messenger** products.
2. App settings → Basic: copy **App ID / App secret** → `META_APP_ID`, `META_APP_SECRET`.
3. Facebook Login → Settings → Valid OAuth redirect URIs: `https://yourdomain.com/api/meta/facebook/callback`.
4. Webhooks → **Page** object: callback `https://yourdomain.com/api/webhooks/meta`, same verify token; subscribe to `feed`, `messages`, `messaging_postbacks`.

### Going live (selling to other businesses)
While the app is in Development mode only people with a role on the app can connect. To let customers connect you need, in this order:
1. **Business Verification** of your Meta Business portfolio (registered company documents, English or certified translation).
2. **Access Verification** (Tech Provider) — required because the app requests `instagram_business_basic`.
3. **App Review** for `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`, `pages_messaging`, `pages_manage_engagement`, `pages_read_engagement`, `pages_show_list`, `pages_manage_metadata`, `instagram_manage_messages`, `instagram_manage_comments`.
4. Complete the annual **Data Protection Assessment** when Meta requests it.

See `docs/META_APP_REVIEW.md` for the screencast script and permission justifications.

## 4. Run locally

### Without Supabase or Docker (fastest)

An embedded Postgres (PGlite) and a dev-only sign-in bypass let you run the whole product on a laptop with no accounts:

```bash
npm run db:local          # terminal 1 — Postgres on 127.0.0.1:5433, data in .local-db/
```

In `.env` (see the "Local development" block in `.env.example`):

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1&pgbouncer=true
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1&pgbouncer=true
DEV_AUTH_EMAIL=you@example.com     # signs you in as this user — honoured only when NODE_ENV=development
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co   # must be present; never called while DEV_AUTH_EMAIL is set
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
```

```bash
npx prisma db push        # terminal 2 — create the tables
npm run db:seed           # demo organizations with channels, contacts, pipelines, logs (SEED_EMAIL=you@example.com to own it)
npm run dev               # http://localhost:3000 — you are signed in as DEV_AUTH_EMAIL
npm run worker            # terminal 3 — sends the DMs (demo channels have fake tokens and cannot send)
```

The bypass is ignored in production builds.

### With real Supabase + Meta

```bash
npm run dev       # http://localhost:3000
npm run worker    # second terminal
```

### Local with a tunnel

Meta cannot talk to `localhost`: Instagram Login requires an **HTTPS** redirect URI, and webhooks are delivered from Meta's servers to a public host. So local development needs a tunnel — the app still runs on your machine, it just gets a public HTTPS address.

```bash
npm run tunnel          # prints https://<random>.trycloudflare.com
```

Paste that URL into `NEXT_PUBLIC_APP_URL` in `.env`, restart `npm run dev`, then:

```bash
npm run setup:urls      # prints the exact value for every console field
npm run verify          # live-tests Supabase, Postgres, Meta, Dodo, webhook handshake
```

> **The quick-tunnel URL changes every time cloudflared restarts**, and Meta matches redirect URIs exactly — so a restart means re-registering every URL. For anything beyond a one-off test, get a stable URL:
>
> - **Domain on Cloudflare** — `cloudflared tunnel create awwtomation`, route it at a subdomain (e.g. `dev.yourdomain.com`), then `cloudflared tunnel run`. Free and permanent.
> - **ngrok** — the free tier includes one static domain: `ngrok http 3000 --domain your-name.ngrok-free.app`.
>
> Register the stable URL in Meta once and you never touch it again.

## 5. Deploy

Full recipes in **[docs/DEPLOY.md](DEPLOY.md)**: (a) Vercel + Supabase + Railway worker, (b) Docker Compose on any Linux VPS — `docker compose --profile proxy up -d --build` gives you Postgres, web, worker and automatic HTTPS, (c) Railway all-in-one. Config files are in the repo: `Dockerfile`, `docker-compose.yml`, `railway.json` / `railway.worker.json`, `render.yaml`, `vercel.json`.

The short version:

- Set `NEXT_PUBLIC_APP_URL` to the final https domain **before** connecting any channel (OAuth redirect URIs and webhook URLs derive from it). `NEXT_PUBLIC_*` values are inlined at build time — change them and rebuild.
- Run `npx prisma migrate deploy` against the production database on every release.
- Run the worker (`npm run worker`) as a second process. Without one, cron `GET /api/cron/tick` every minute.
- Cron safety nets: `/api/cron/refresh-tokens` daily, `/api/cron/reconcile` every 5 minutes — `Authorization: Bearer $CRON_SECRET` or `?token=`.
- Point an uptime monitor at `GET /api/health`.

## 6. First login

Sign in with Google → you land on onboarding → name your organization and first workspace → connect Instagram.

## 7. Billing (Dodo Payments)

Plans are enforced server-side from day one; without Dodo credentials every organization stays on FREE and the Billing page shows the plans as "contact us". To charge money: create the six products (`node --env-file=.env scripts/create-dodo-products.mjs`), fill in `DODO_MODE`, `DODO_SECRET_KEY`, `DODO_WEBHOOK_SECRET` and the `DODO_PRODUCT_*` ids, and register the webhook endpoint `https://yourdomain.com/api/billing/webhook`. Test mode and live mode use different keys and product ids. Everything else (checkout, portal, plan changes, cancellations, reconciliation, plan overrides) is in **[docs/BILLING.md](BILLING.md)**.

## 8. Product notes worth knowing

- **Segments** (saved from the Contacts page, `/api/segments`): named contact filters — channel or platform, tags (all / any), followers only or non-followers, interacted within the last N days, opted-out excluded — that broadcasts can target instead of a single tag. A segment is evaluated when the broadcast runs, so the 24-hour-window eligibility count on the broadcast page is live.
- **Delete channel & data** (Channels → ⋯ → Delete channel & data, OWNER only): unlike *Disconnect*, which keeps contacts, conversations and logs for reconnection, this removes the channel and everything cascading from it (contacts, conversations, messages, delivery logs, media cache, sessions). It is the action to offer a client who leaves and asks for their data to be erased, and what Meta's data-deletion callback triggers automatically. It cannot be undone; the audit log records who did it and the row counts.
- **Plan overrides**: run `npx tsx scripts/set-plan.ts set <organization> <plan>` to pin an organization to a plan; the override wins over the Dodo subscription until `scripts/set-plan.ts clear <organization>`. There is no admin page by design.
