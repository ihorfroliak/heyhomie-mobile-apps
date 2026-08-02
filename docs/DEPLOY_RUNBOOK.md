# DEPLOY_RUNBOOK.md — from a green repo to a live product

Everything here is **infra/account-gated**: the code is ready, these steps need hosting,
API keys and developer accounts. Each phase is independently shippable — do them in order.
Cross-surface status lives in [`../../heyhomie-shared/ROADMAP.md`](../../heyhomie-shared/ROADMAP.md).

> Verify before you start: `npm run check` must be green (tests + typecheck + app guard).

---

## Phase 1 — deploy the orders backend

The stack is `server/Dockerfile` (node 20-alpine, non-root, `HEALTHCHECK`, node as PID 1) +
Postgres. Migrations run automatically at boot (advisory-locked, exactly-once).

### 1.1 Provision
- A container host (Fly.io / Railway / Render / any k8s) — the image needs **1 process, port 8090**.
- A **managed Postgres 16** (never the compose one — that has no backups).
- TLS terminates at the platform's proxy → set `TRUST_PROXY=1` so the rate limiter sees real client IPs.

### 1.2 Production environment
Required (the app **refuses to boot** on a bad value — `loadServerConfig` fails fast):

| Var | Production value | Why |
|---|---|---|
| `DATABASE_URL` | managed-Postgres URL | must be `postgres://…` |
| `NODE_ENV` | `production` | turns on the prod guards |
| `AUTH_SECRET` | **≥32 chars, random** — `openssl rand -base64 36` | HMAC signing key; any `dev-secret-change-me*` is rejected in prod |
| `AUTH_DEV_MODE` | `0` | must be off in prod (`/dev/token` isn't even registered) |
| `TRUST_PROXY` | `1` | real client IP behind the LB |
| `PORT` | `8090` | matches the Dockerfile/healthcheck |
| `SHUTDOWN_DRAIN_MS` | `3000`–`10000` | readiness-flip drain window before close |

Optional tuning (sane defaults ship): `AUTH_ACCESS_TTL_SEC` 900 · `AUTH_REFRESH_TTL_SEC` 2592000 ·
`AUTH_INVITE_TTL_SEC` 604800 · `AUTH_RESET_TTL_SEC` 3600 · `AUTH_PURGE_INTERVAL_SEC` 3600 ·
`SSE_HEARTBEAT_SEC` 15 · `RATE_CAPACITY` 120 / `RATE_REFILL` 20 · `AUTH_RATE_CAPACITY` 20 /
`AUTH_RATE_REFILL` 0.5 (stricter bucket on login/register/reset/accept-invite).

**Never** put `AUTH_SECRET` in compose/git — `docker-compose.yml` deliberately has no default and
refuses to start without it.

### 1.3 Build + run
```bash
docker build -f server/Dockerfile -t heyhomie-orders .
```
Platform config: health check → `GET /health/ready` (503 while draining), liveness → `/health/live`,
stop signal `SIGTERM` with a grace period **> `SHUTDOWN_DRAIN_MS`** (the process flips readiness,
drains, then closes bounded).

### 1.4 Smoke test (in order)
```bash
curl -s $BASE/health/live                      # {"status":"up"}
curl -s $BASE/health/ready                     # {"status":"ready","db":"up"}  ← proves migrations + DB
curl -s $BASE/pricing/cleaning | head -c 200   # canonical price table (public)
curl -s -o /dev/null -w '%{http_code}\n' $BASE/orders   # 401 — auth is enforced
curl -s -o /dev/null -w '%{http_code}\n' $BASE/dev/token # 404 — dev mint is off in prod
```
Then register a real account through `/auth/register` and confirm a token works on `/orders`.

### 1.5 Observability + safety
- Scrape **`GET /metrics`** (Prometheus). Alert on: `http_requests` 5xx rate, `errors{code=...}`,
  `auth_failures` spikes, `sse_connections` drift, request-duration p99.
- Ship the JSON logs (pino). Every line carries `correlationId` + `tenantId`; auth headers are redacted.
- **Backups**: enable managed-Postgres PITR/daily snapshots, then **run a restore drill** into a scratch
  DB and re-run `npm run test:pg` against it. A backup you haven't restored isn't a backup.
- Rollback = redeploy the previous image tag. Migrations are additive-only, so an older image keeps
  working against a newer schema.

### 1.6 Known scale limits (single-instance today)
Rate limiter, idempotency store, SSE fan-out and the revocation index are **in-process**. One instance
is correct; before scaling horizontally they need a shared store (Redis) + Postgres `LISTEN/NOTIFY`
for the change feed. Vertical scaling first.

---

## Phase 2 — wire the real integrations

### 2.1 Stripe (payments)
The domain lifecycle already exists (`packages/domain/payment.ts`): booked → `awaiting_completion`,
mission done → `due` (charge scheduled 03:00 **Europe/Warsaw** the next day), then card auto-charge or
a hosted pay-later link; `settle`/`markPaid` transitions are in `orderService`. What's missing is the
real provider:
1. Stripe account (PLN), test + live keys. Secret key **server-side only**; the app gets the publishable key.
2. Implement against the existing seams: charge-on-file (PaymentIntent, off_session), pay-later
   (Checkout link emailed), and a **webhook** endpoint that verifies the signature and drives
   `markPaid` / failure.
3. Charge the **canonical amount** — `GET /pricing/cleaning` / `cleaningPrice()`. Send integer minor
   units (grosze) to Stripe.
4. Idempotency: pass a Stripe idempotency key per charge; the order id is a natural key.

### 2.2 Email / SMS
`NotificationPort` (`packages/api/notificationPort.ts`) is the single delivery seam — invite + password-reset
today. Swap `consoleNotificationPort()` in `server/src/index.ts` for a real adapter (SES/SendGrid/Postmark,
Twilio for SMS). Rules that must hold: delivery is **best-effort + isolated** (a send failure never fails
the auth op) and **never logs tokens**.

### 2.3 Point the web site at this backend
`heyhomie-web` currently talks to a separate API. Once this backend is live, move its booking to
`EXPO_PUBLIC_ORDERS_API_URL`-equivalent + the `/pricing/cleaning` canon so web and mobile agree.

---

## Phase 3 — ship the apps

`eas.json` (dev/preview/production) and bundle ids (`pl.heyhomie.{client,worker,admin}`) are committed;
SDK 54 bundles clean.

1. Accounts: **Apple Developer** ($99/yr) + **Google Play Console** ($25 once). Expo/EAS account.
2. Set `EXPO_PUBLIC_ORDERS_API_URL` to the Phase-1 URL in the production profile (this is what flips the
   apps from the offline Local adapter to the real backend).
3. Assets: icon + splash + store screenshots per app (brand tokens in `packages/design`).
4. Build + submit per app:
   ```bash
   cd apps/client && eas build --profile production --platform all
   cd apps/client && eas submit --profile production --platform all
   ```
   Repeat for `worker`, `admin`. **Note:** admin/worker are internal tools — prefer TestFlight /
   Play internal testing tracks over public listings.
5. Store listings: PL + EN copy, privacy policy URL (see `legal/`), data-safety form.

---

## What is NOT blocked by any of this
Ordinary feature work continues offline: the apps run against the Local adapter, the gate
(`npm run check`) covers domain/api/server logic, and `test:live` / `test:e2e` exercise a real Fastify
instance without external services.
