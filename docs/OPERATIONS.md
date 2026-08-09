# Operations Guide

## Local development

Prerequisites: Node 20+ and PostgreSQL 16 (Docker, WSL, or native).

```bash
cp .env.example .env         # set AUTH_SECRET (openssl rand -base64 32)
npm install

# Option A — Docker:
docker compose -f docker-compose.dev.yml up -d
# Option B — Postgres in WSL Ubuntu:
#   wsl -d Ubuntu -u root -- service postgresql start
#   (user corestudio / password corestudio_dev / db corestudio)

npm run db:migrate
npm run db:seed
npm run dev                  # http://localhost:3000
```

> **Windows note:** keep `127.0.0.1` (not `localhost`) in `DATABASE_URL`.
> Windows resolves `localhost` to IPv6 first, which adds ~2s per new
> connection and makes Prisma interactive transactions time out (P2028).

Seeded logins (password `password123`): `owner@corestudio.test` (OWNER),
`admin@corestudio.test` (ADMIN), `efua@corestudio.test` (TRAINER),
`ama@member.test` (MEMBER). OTP codes and all SMS print to the dev-server
console (`SMS_PROVIDER=console`).

To exercise the scheduled jobs locally:

```bash
curl -X POST -H "Authorization: Bearer dev-cron-secret" http://localhost:3000/api/cron
```

## Testing

```bash
npm test          # 12 Vitest business-rule tests
npm run test:e2e  # Playwright booking flow (needs seeded dev DB; first run: npx playwright install chromium)
```

The Vitest suite provisions its own `corestudio_test` database (created
automatically via the dev connection) and truncates tables between tests —
it never touches dev data. Tests run serially (`fileParallelism: false`)
because they share that database.

## Production deployment (VPS, Docker Compose)

1. Install Docker + Compose on the VPS; clone the repo.
2. `cp .env.example .env` and set: `POSTGRES_PASSWORD`, `AUTH_SECRET`,
   `AUTH_URL` (public https URL), `PAYSTACK_SECRET_KEY` /
   `PAYSTACK_PUBLIC_KEY`, `SMS_PROVIDER` (+ its keys), `SMS_SENDER_ID`
   (registered with the SMS provider), `CRON_SECRET`.
3. `docker compose up -d --build`
   - `postgres` — data in the `pgdata` volume
   - `app` — runs `prisma migrate deploy` on boot, then the standalone server
   - `nginx` — port 80 (add 443 + certificates in `nginx.conf` for TLS)
   - `cron` — POSTs `/api/cron` every 5 minutes
4. First boot: create the OWNER account. Either run the seed (demo data:
   `docker compose exec app sh -c "cd /app && node_modules/.bin/prisma db seed"`
   — note the seed **wipes existing data**) or insert an owner user manually.
5. **Paystack dashboard** → Settings → API Keys & Webhooks → set the webhook
   URL to `https://<your-domain>/api/webhooks/paystack`. Use test keys until
   go-live.
6. SMS sender ID must be pre-registered with Arkesel/Hubtel or messages
   will be rejected by the carrier.

### Updating

```bash
git pull
docker compose up -d --build   # migrations run automatically on app boot
```

### Backups

All state lives in Postgres (`pgdata` volume). Minimal nightly backup:

```bash
docker compose exec postgres pg_dump -U corestudio corestudio | gzip > backup-$(date +%F).sql.gz
```

## Environment variables

See [.env.example](../.env.example) — every variable is documented inline.
`CRON_SECRET` and `AUTH_SECRET` should be long random strings
(`openssl rand -hex 24`).

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `P2028: Unable to start a transaction in the given time` | DB connection latency — use `127.0.0.1` instead of `localhost` on Windows; check Postgres is up |
| `EPERM … query_engine-windows.dll.node` during `prisma generate`/`migrate` | The dev server holds the engine DLL — stop `npm run dev`, rerun, restart |
| Webhook returns 401 | `PAYSTACK_SECRET_KEY` mismatch — the signature is HMAC-SHA512 of the raw body with the **secret** key |
| Paystack checkout 500s | Keys unset/invalid, or amount ≤ 0 (wallet already covers it) |
| Members can't book, "frozen" | Renewal unpaid 3+ days past `cycleRenewsAt` — record the renewal payment (description containing "renew") or renew via the app, then the next cron run reactivates |
| No SMS arriving | `SMS_PROVIDER=console` (dev default) logs to stdout; for arkesel/hubtel check the provider key and registered sender ID |
| Sessions not appearing beyond 2 weeks | Cron not running — check the `cron` container / your scheduler is POSTing `/api/cron` |
| Prisma v7 upgrade prompt | **Don't** — the project pins v6; v7 moved datasource URLs out of the schema and requires driver adapters |

## Scheduled-job cadence

`/api/cron` is designed for a 5-minute cadence. What each pass does and its
tolerance:

| Job | Effect of a late run |
| --- | --- |
| Session generation (4 weeks ahead) | None until the horizon shrinks below `advanceBookingDays` |
| Auto-complete + NO_SHOW | Bookings stay BOOKED slightly longer; payout eligibility unaffected in practice |
| Waitlist offer expiry | The next member's window opens late |
| Plan cycles (renew/freeze) | Freeze happens on the first run after the 3-day grace |
| Reminders 24h/2h/renewal | A reminder can arrive late; the 2h reminder window means runs must be ≤2h apart to guarantee delivery before class |
