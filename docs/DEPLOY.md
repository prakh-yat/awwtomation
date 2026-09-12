# Deploying Awwtomation

Three tested layouts, from "no servers to manage" to "one Linux box you fully own". All of them run the same two processes and the same database schema; pick by budget and by how much you want to operate yourself.

| | A. Vercel + Supabase + Railway worker | B. Docker Compose on a VPS | C. Railway all-in-one |
|---|---|---|---|
| Accounts needed | Vercel, Supabase, Railway, Meta | a VPS (any provider), Supabase (auth only), Meta | Railway, Supabase (auth only), Meta |
| Card required | Vercel Hobby: no. Railway: yes (after trial) | depends on the VPS provider — many accept local payment | yes (after trial) |
| Ops effort | lowest | you patch the box, you back up | low |
| Typical cost | $0–20 + $5 worker | $5–10 for the box | $10–20 |
| Best for | fastest launch, global CDN | full control, data stays on your server, works from anywhere (including Nepal, no US-only services) | one dashboard for everything |

Whatever you choose, **Supabase Auth is the one external service you cannot skip**: Google sign-in goes through it. The free tier is enough and it needs no card. The database can live anywhere.

---

## 1. Before you deploy (every recipe)

### 1.1 Decide the domain first

`NEXT_PUBLIC_APP_URL` is baked into OAuth redirect URIs, webhook URLs and tracked links. Connecting a channel with a temporary URL and changing it later means reconnecting every channel. Pick the final `https://` domain now, even if the DNS record comes a day later.

### 1.2 Generate secrets

```bash
openssl rand -base64 32   # APP_ENCRYPTION_KEY  — encrypts Meta tokens; losing it orphans every connected channel
openssl rand -hex 24      # CRON_SECRET
openssl rand -hex 16      # META_WEBHOOK_VERIFY_TOKEN
```

Keep `APP_ENCRYPTION_KEY` somewhere safe outside the server. A database backup restored with a different key contains channels that cannot send.

### 1.3 Environment checklist

Run `node scripts/check-env.mjs` (or `npm run check-env`) in the repo with your `.env` — it prints every variable, masked, and exits non-zero if a required one is missing. Use `--json` inside deploy scripts.

| Variable | Needed | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | always | final https URL, no trailing slash. **Build-time** value. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | always | Supabase → Project Settings → API. **Build-time** values. |
| `DATABASE_URL` | always | pooled URL (Supabase: port 6543, `?pgbouncer=true`) or plain Postgres |
| `DIRECT_URL` | for migrations | direct URL (Supabase: port 5432). Same as `DATABASE_URL` for plain Postgres. |
| `APP_ENCRYPTION_KEY` | always | see above |
| `CRON_SECRET` | always in prod | protects `/api/cron/*` |
| `META_WEBHOOK_VERIFY_TOKEN` | before webhooks | any string, pasted into the Meta webhook config |
| `SUPER_ADMIN_EMAILS` | recommended | your email → `/admin` |
| `INSTAGRAM_APP_ID/SECRET`, `META_APP_ID/SECRET` | to connect channels | see `docs/SETUP.md` §3 — the app boots without them |
| `DODO_*` | to charge money | see `docs/BILLING.md` — without them every workspace stays on FREE |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional | invite emails; invites work as links regardless |

**Build-time vs runtime.** Next.js inlines every `NEXT_PUBLIC_*` value into the JavaScript bundle when `next build` runs. Changing one later means rebuilding (Vercel/Railway/Render: redeploy; Docker: `docker compose build web`). Everything else is read at process start.

### 1.4 Supabase (auth + optionally the database)

Follow `docs/SETUP.md` §1 once. The two settings people forget:

- **Authentication → URL Configuration**: Site URL = `NEXT_PUBLIC_APP_URL`; Redirect URLs must include `https://YOUR_DOMAIN/**`.
- If you use Supabase Postgres: `DATABASE_URL` = pooled (6543, transaction mode, `?pgbouncer=true&connection_limit=10`), `DIRECT_URL` = direct (5432).

---

## 2. Recipe A — Vercel (web) + Supabase (auth + DB) + Railway (worker)

Vercel runs the Next.js app and the cron endpoints; Railway runs the long-lived worker (Vercel has no always-on processes).

1. **Import** the repository at vercel.com → Add New → Project. Framework preset: Next.js, Node 20. Leave the build command as `npm run build`.
2. **Environment variables** (Settings → Environment Variables, Production): everything in §1.3. Name the cron secret exactly `CRON_SECRET` — Vercel then sends `Authorization: Bearer $CRON_SECRET` on every cron invocation automatically, which is what `/api/cron/*` expects.
3. **Migrations**. The build does not touch the database. Either run them from your laptop before the first deploy:
   ```bash
   DIRECT_URL=... DATABASE_URL=... npx prisma migrate deploy
   ```
   or change the Vercel build command to `npx prisma migrate deploy && npm run build` so every deploy migrates first (needs `DIRECT_URL` in the build environment).
4. **Crons** are declared in `vercel.json` (`tick` every minute, `reconcile` every 5 minutes, `refresh-tokens` daily at 03:00 UTC). Vercel enables them on deploy. **Hobby plan caveat**: Hobby allows two cron jobs, each at most once per day — a deploy with the minute schedules is rejected. On Hobby, keep only `refresh-tokens` in `vercel.json` and either run the Railway worker (then `tick` is unnecessary and the worker also reconciles) or point a free external scheduler such as cron-job.org at `https://YOUR_DOMAIN/api/cron/tick?token=YOUR_CRON_SECRET` every minute.
5. **Worker on Railway**: New Project → Deploy from GitHub → this repo. In the service **Settings → Config-as-code**, set the path to `railway.worker.json` (start command `npm run worker`, no health check). Add the same variables as Vercel — the worker validates `NEXT_PUBLIC_SUPABASE_*` too even though it never signs anyone in. Deploy; the logs should show `worker.started` then a `worker.heartbeat` line every 30 s.
6. **Domain**: Vercel → Settings → Domains → add yours; set `NEXT_PUBLIC_APP_URL` to it and redeploy. Update the Supabase redirect URL and the Meta URLs (§5.2).
7. **Verify**: `curl https://YOUR_DOMAIN/api/health` → `"ok": true`, `"worker": { "status": "healthy" }` after the first heartbeat.

---

## 3. Recipe B — Docker Compose on a VPS

Everything on one Linux machine: Postgres, web, worker, and Caddy for automatic HTTPS. Works on any provider that gives you a root shell (local Nepali hosts, Hetzner, DigitalOcean, Contabo, a Proxmox VM at the office…). No US-only payment or identity checks beyond Supabase Auth.

**Sizing**: 1 vCPU / 2 GB RAM runs comfortably to a few hundred thousand DMs a month. Ubuntu 22.04 or 24.04.

### 3.1 Prepare the box

```bash
# as root, once
curl -fsSL https://get.docker.com | sh          # Docker Engine + compose plugin
apt-get install -y git ufw
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
adduser --disabled-password app && usermod -aG docker app && su - app
```

Point an `A` record (and `AAAA` if you have IPv6) for your domain at the server **before** starting Caddy, otherwise certificate issuance fails and retries with backoff.

### 3.2 Configure

```bash
git clone https://github.com/YOUR_ORG/awwtomation.git && cd awwtomation
cp .env.example .env && nano .env
```

Fill in `.env`:

- `NEXT_PUBLIC_APP_URL=https://app.example.com` and `APP_DOMAIN=app.example.com`
- `POSTGRES_PASSWORD=<something long>` — the compose file builds `DATABASE_URL`/`DIRECT_URL` from it and **ignores** the `DATABASE_URL` lines in `.env` (they are overridden to point at the bundled Postgres container).
- Supabase auth values, `APP_ENCRYPTION_KEY`, `CRON_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `SUPER_ADMIN_EMAILS`, and Meta/Dodo credentials when you have them.

Check it: `docker run --rm -v "$PWD:/app" -w /app node:20-alpine node scripts/check-env.mjs` (or `node scripts/check-env.mjs` if Node is installed on the box).

### 3.3 Launch

```bash
docker compose --profile proxy up -d --build
docker compose ps                 # postgres healthy, migrate exited (0), web + worker + caddy up
curl -s https://app.example.com/api/health
```

What happened: the `worker` image was built (it doubles as the Prisma CLI image), `migrate` applied `prisma/migrations` and exited, then `web` (the standalone Next.js server, non-root, health-checked) and `worker` started. Caddy obtained a Let's Encrypt certificate for `APP_DOMAIN` and proxies to `web:3000`.

Prefer your own nginx/Apache? Skip `--profile proxy`; the app listens on `127.0.0.1:${WEB_PORT:-3000}` — proxy to it and terminate TLS yourself:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header X-Forwarded-For $remote_addr;
}
```

Optional demo data for a first look: `docker compose run --rm worker ./node_modules/.bin/tsx prisma/seed.ts`.

### 3.4 Day-2 operations

**Update**
```bash
git pull
docker compose --profile proxy up -d --build    # rebuilds images, re-runs migrate, restarts web + worker
docker image prune -f
```
`web` and `worker` restart in place; in-flight jobs are released after 10 minutes if a container died mid-job, and re-run — every send is idempotent (dedupe keys), so nothing is sent twice.

**Backups** — `pg_dump` from the Postgres container, nightly, kept 14 days:
```bash
mkdir -p ~/backups
cat > ~/backup.sh <<'SH'
#!/bin/sh
cd ~/awwtomation && docker compose exec -T postgres pg_dump -U postgres -d awwtomation --no-owner \
  | gzip > ~/backups/awwtomation-$(date +%F).sql.gz
find ~/backups -name '*.sql.gz' -mtime +14 -delete
SH
chmod +x ~/backup.sh
(crontab -l 2>/dev/null; echo "15 3 * * * $HOME/backup.sh") | crontab -
```
Copy the dumps off the box (`rsync` to a laptop, `rclone` to any object storage) and store `.env` — especially `APP_ENCRYPTION_KEY` — with them. **Restore**: `gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U postgres -d awwtomation` into an empty database, then `docker compose up -d`.

**Logs** — JSON lines, one event per line, from both processes:
```bash
docker compose logs -f --tail 200 web worker
docker compose logs --since 1h worker | grep '"level":"error"'
docker compose logs web | grep '"event":"webhook'          # what Meta is sending you
```
Keep Docker's log files from filling the disk (once, as root, then `systemctl restart docker`):
```json
// /etc/docker/daemon.json
{ "log-driver": "json-file", "log-opts": { "max-size": "50m", "max-file": "5" } }
```

**Database access**: `docker compose exec postgres psql -U postgres -d awwtomation`. Port 5432 is published on `127.0.0.1` only; use an SSH tunnel for GUI clients.

**Cron**: not needed — the worker refreshes tokens and reconciles comments on its own schedule. If you want a belt-and-braces poke anyway: `*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://app.example.com/api/cron/reconcile`.

**External database instead of the bundled Postgres** (e.g. Supabase): remove the `DATABASE_URL`/`DIRECT_URL` overrides from the `x-app-env` block in `docker-compose.yml`, delete the `postgres` service and the `migrate` `depends_on`, and set the URLs in `.env`.

---

## 4. Recipe C — Railway all-in-one

Railway runs the web service, the worker and Postgres in one project. `railway.json` (web) and `railway.worker.json` (worker) hold the config; both force the Nixpacks builder so Railway ignores the `Dockerfile` (which exists for recipe B).

1. **Web**: New Project → Deploy from GitHub repo. Railway reads `railway.json`: build `npm run build`, start `npx prisma migrate deploy && npm start`, health check `/api/health`. The first deploy fails until the variables exist — expected.
2. **Postgres**: in the project, + New → Database → PostgreSQL. In the web service's Variables add `DATABASE_URL=${{Postgres.DATABASE_URL}}` and `DIRECT_URL=${{Postgres.DATABASE_URL}}` (reference variables).
3. **Variables**: add the rest of §1.3. Use the project's **Shared Variables** so the worker can reference them (`${{shared.APP_ENCRYPTION_KEY}}` etc.). Set `NIXPACKS_NODE_VERSION=20` if Railway picks a newer Node than you tested with.
4. **Worker**: + New → GitHub repo → same repository. In its Settings → **Config-as-code** set `railway.worker.json`; that gives it `npm run worker` as the start command and no health check. Add the same variables (reference the shared ones). Deploy; expect `worker.started` and periodic `worker.heartbeat` in its logs.
5. **Domain**: web service → Settings → Networking → Custom Domain (or Generate Domain to start). Set `NEXT_PUBLIC_APP_URL` to it and **redeploy** — it is a build-time value.
6. **Cron**: none required with the worker running. Railway can also run a service on a schedule (Settings → Cron Schedule) if you ever drop the worker: a service with start command `curl -fsS -H "Authorization: Bearer $CRON_SECRET" $NEXT_PUBLIC_APP_URL/api/cron/tick` on `* * * * *`.
7. **Backups**: Railway Postgres supports volume backups (Database → Backups). Enable daily; also take a manual `pg_dump` via `railway connect postgres` before risky upgrades.

Rather deploy the Docker image on Railway? In `railway.json` set `"builder": "DOCKERFILE"`; for the worker service set the variable `RAILWAY_DOCKERFILE_PATH=Dockerfile` plus a **Custom Start Command** of `./node_modules/.bin/tsx worker/index.ts` — and note the runner image has no Prisma CLI, so migrations move to a one-off `railway run npx prisma migrate deploy` from your machine.

---

## 5. After the first deploy (every recipe)

### 5.1 Domain + HTTPS rules

- The app must be served over `https://`; Meta refuses plain-http redirect URIs and webhook callbacks, and Supabase cookies are `Secure`.
- Vercel/Railway/Render terminate TLS for you. On Compose, Caddy does. Behind your own proxy, forward `X-Forwarded-Proto: https`.
- `NEXT_PUBLIC_APP_URL` must equal what users type in the address bar — no `www` mismatch — or Google sign-in bounces back to the wrong host.

### 5.2 URLs to register elsewhere

| Where | Setting | Value |
|---|---|---|
| Supabase → Authentication → URL Configuration | Site URL / Redirect URLs | `https://YOUR_DOMAIN` / `https://YOUR_DOMAIN/**` |
| Meta app → Instagram → Business login settings | OAuth redirect URI | `https://YOUR_DOMAIN/api/meta/instagram/callback` |
| same | Deauthorize / Data deletion | `https://YOUR_DOMAIN/api/meta/deauthorize`, `https://YOUR_DOMAIN/api/meta/data-deletion` |
| Meta app → Facebook Login → Settings | Valid OAuth redirect URIs | `https://YOUR_DOMAIN/api/meta/facebook/callback` |
| Meta app → Webhooks (Instagram + Page objects) | Callback URL / Verify token | `https://YOUR_DOMAIN/api/webhooks/meta` / `META_WEBHOOK_VERIFY_TOKEN` |
| Dodo Payments → Developer → Webhooks | Endpoint | `https://YOUR_DOMAIN/api/billing/webhook` (secret → `DODO_WEBHOOK_SECRET`) |

Meta calls `GET /api/webhooks/meta` once to verify the token when you save the webhook — the app must already be up.

### 5.3 Cron endpoints

| Route | Purpose | Schedule | Needed when |
|---|---|---|---|
| `/api/cron/tick` | drains the job queue for up to 45 s | every minute | **only** without a worker (Vercel-only setups) |
| `/api/cron/reconcile` | queues a comment poll per channel — catches webhooks Meta dropped | every 5 min | safety net; the worker does this itself |
| `/api/cron/refresh-tokens` | refreshes Instagram tokens with < 10 days left | daily | safety net; the worker does this itself |

Authentication, either form:

- `Authorization: Bearer $CRON_SECRET` — Vercel sends this automatically when the variable is named `CRON_SECRET`; `curl -H` from anything else.
- `?token=$CRON_SECRET` — for schedulers that cannot set headers. The header is preferred: query strings land in access logs.

`GET` and `POST` both work. A `401` means the secret differs between the caller and the app.

### 5.4 Health endpoint

`GET /api/health` is public, secret-free and cheap. Docker's `HEALTHCHECK`, Railway and Render already poll it; add it to an uptime monitor (Better Uptime, UptimeRobot, cron-job.org) with a 1-minute interval.

```json
{
  "ok": true, "status": "ok", "version": "0.1.0", "commit": "a1b2c3d4e5f6",
  "db": { "ok": true, "latencyMs": 4 },
  "worker": { "status": "healthy", "lastHeartbeat": "2026-09-07T03:12:41.000Z", "dueJobs": 0 },
  "billingConfigured": true, "metaConfigured": { "instagram": true, "facebook": false }, "cronConfigured": true
}
```

- HTTP `503` only when the database is unreachable (that is what should restart/alert).
- `worker.status`: `healthy` (touched a job in the last 5 min), `idle` (alive earlier, nothing to do), `stale` (**due jobs nobody is claiming for 2+ min — the worker is down**), `unknown` (never seen; fresh install).
- `/admin/health` (super admins) shows the long version: queue depth, stale jobs, expiring tokens, webhook errors.

### 5.5 Logs — where and what

Both processes write JSON lines: `{"level":"info","event":"worker.heartbeat","time":"…",…}`. Filter on `event` and `level`.

| Host | Where |
|---|---|
| Vercel | Project → Logs (runtime); add a Log Drain for retention |
| Railway | service → Deployments → View Logs; Observability tab for search |
| Render | service → Logs; Log Streams to ship elsewhere |
| Compose | `docker compose logs -f web worker` (see §3.4 for rotation) |

Events worth alerting on: `app.boot.invalid_env` (a required variable is missing — the process exits in production), `admin.health.db_unreachable`, `worker.uncaught_exception`, `webhook.invalid_signature`, `webhook.verify_rejected`, `meta.usage_high`. The boot line `app.boot` lists `missingOptional` integrations so you can confirm what a deployment has enabled.

### 5.6 Backups by recipe

| Recipe | Database | What else |
|---|---|---|
| A / Supabase Postgres | Supabase → Database → Backups (daily on Pro; PITR add-on). Free tier: run `pg_dump` yourself against `DIRECT_URL` from a cron on any machine. | `.env` values, above all `APP_ENCRYPTION_KEY` |
| B / Compose | `pg_dump` script in §3.4 | `.env`, the `pgdata` volume if you prefer volume snapshots |
| C / Railway | Database → Backups (volume snapshots) | Shared Variables export |

Test a restore once into a throwaway database. Backups nobody has restored are hopes, not backups.

### 5.7 Scaling and tuning

- Several workers are safe (`SKIP LOCKED` claiming, bucketed dedupe keys). Scale the worker before the web tier — sends are the bottleneck.
- `WORKER_BATCH_SIZE` (10) and `WORKER_POLL_INTERVAL_MS` (2000) trade latency for database chatter; `COMMENT_POLL_INTERVAL_MS` (5 min) is the reconciliation cadence — lower it only if webhooks are unreliable.
- Postgres connections: each web instance and each worker holds a small pool. On Supabase use the pooled URL for `DATABASE_URL` and keep `connection_limit` modest (10).

### 5.8 Troubleshooting

| Symptom | Cause → fix |
|---|---|
| Build fails: "pass --build-arg NEXT_PUBLIC_…" | Docker build without the three public build args. Set them in `.env` (Compose reads it) or pass `--build-arg`. |
| Login page loads, Google button errors | `NEXT_PUBLIC_SUPABASE_*` wrong at **build** time, or the domain is missing from Supabase Redirect URLs. Rebuild after fixing. |
| `/api/health` → 503 | database unreachable: wrong `DATABASE_URL`, Postgres not started, firewall. Web logs show `admin.health.db_unreachable` with the driver error. |
| `worker.status: "stale"` | worker process not running or cannot reach the DB. Check its logs for `worker.started`; on Compose `docker compose ps worker`. |
| Cron returns 401 | `CRON_SECRET` mismatch, or the scheduler sends no header — use `?token=`. |
| Webhook verification fails in Meta | app not reachable over https yet, or `META_WEBHOOK_VERIFY_TOKEN` differs from what you typed in Meta. |
| Comments arrive but no DM | worker down (see above) or plan quota reached — Logs page shows the skip reason per delivery. |
| Boot log `app.boot.billing_test_mode` | `DODO_MODE=test` in production. Intentional? set `DODO_ALLOW_TEST_MODE_IN_PRODUCTION=true`. |
| Process exits immediately with "Invalid environment configuration" | a required variable is missing; the message lists which. `node scripts/check-env.mjs` shows the same table. |
