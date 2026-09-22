# CoreStudio — Technical Write-up

_A studio management platform for a pilates studio in Accra, Ghana. Built July 2026._

## 1. What it is

CoreStudio replaces spreadsheet-and-WhatsApp studio administration with one
web application serving three audiences:

| Surface | Route group | Audience | Design |
| --- | --- | --- | --- |
| Staff portal | `/admin/*` | Owner, admins, trainers | Desktop-first |
| Member app | `/app/*` | Members | Mobile-first, installable PWA |
| Marketing page | `/` | Public | Live read-only timetable + sign-up |
| REST API | `/api/*` | All of the above | Zod-validated JSON |

The one capability that distinguishes it from off-the-shelf gym software
(GymMaster et al.) is **automated trainer payouts**: the system continuously
computes what each trainer is owed from paid, attended bookings, locks the
included bookings into an immutable payout record, and exports PDF statements.

## 2. Stack and why

- **Next.js 16 (App Router) + TypeScript** — one codebase for all three
  surfaces; server components read the database directly for pages, API
  routes handle mutations. Note: Next 16 renamed `middleware.ts` to
  `proxy.ts` and made `params`/`searchParams` async — both are used here.
- **PostgreSQL + Prisma 6** — relational integrity matters (payout lines,
  booking states); Prisma is pinned to v6 because v7 introduced breaking
  config changes (connection URLs moved out of the schema, driver adapters
  required).
- **NextAuth (Auth.js v5)** — JWT sessions carrying the user's role so the
  edge proxy can gate routes without a database call.
- **Paystack** — the Ghanaian reality: card plus MTN/AT/Telecel mobile money,
  all in GHS, one checkout page, webhooks for confirmation.
- **Arkesel / Hubtel SMS** — behind a `NotificationService` interface so the
  provider is a one-line env change (`SMS_PROVIDER`), with a `console`
  provider for development.
- **Vitest + Playwright** — unit tests pin the money-touching business rules;
  one end-to-end test drives the real booking flow in a browser.
- **Docker Compose** — app + postgres + nginx + a cron container, deployable
  to any VPS.

## 3. Architecture in one paragraph

Pages are thin server components that query Prisma directly and render;
interactive pieces are small client components that call the REST API. Every
mutation lives in `/api/*` behind three gates — Zod validation, an auth
check, a role check — and delegates to a **domain library**
(`src/lib/booking.ts`, `payouts.ts`, `payment-flows.ts`, `cron-jobs.ts`) that
runs the actual logic inside a database transaction and writes an `AuditLog`
row in the same transaction. The domain libraries never import the web layer,
which is what makes them unit-testable against a bare database.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full picture.

## 4. Key design decisions

### Money is integer pesewas, everywhere
All money fields are `Int` pesewas (1 GHS = 100 pesewas). Field names keep
the spec's `GHS` suffix (`priceGHS`, `walletGHS`) but the unit is pesewas —
this is documented at the top of `prisma/schema.prisma`. `formatGHS()` and
`parseGHS()` in `src/lib/money.ts` are the only places that convert. No
floats touch money anywhere in the codebase.

### Paid bookings are created by the webhook, not the checkout
The spec requires that an online booking "is confirmed only on webhook
success". Rather than inventing a `PENDING_PAYMENT` booking state, checkout
creates only a `PENDING` Payment row (keyed by the Paystack reference) and
the **booking itself is created when `charge.success` arrives**. If the spot
filled while the member was paying, the money lands in their wallet and they
are waitlisted — no refund round-trip through Paystack needed. The callback
page's verify endpoint can also fulfil the charge (idempotently) so local
development works without a public webhook URL.

### Idempotency and concurrency
- The webhook handler is idempotent on `Payment.paystackRef` (unique); a
  retry or a verify/webhook race is a no-op.
- Booking creation locks the session row (`SELECT … FOR UPDATE`) inside the
  transaction, so two people racing for the last spot serialize; the loser
  becomes `WAITLIST`.
- `PayoutLine.bookingId` is unique — **a booking can enter a payout once,
  ever**, enforced by the database rather than application code.
- Session generation from recurrence rules is idempotent via a unique
  `(recurrenceRuleId, startsAt)` constraint with `skipDuplicates`.

### The waitlist state machine
`WAITLIST` bookings carry an optional `promotionExpiresAt`. When a spot
opens: a member **with credits is auto-promoted** (credit consumed, SMS
confirmation); a member **without credits gets a 2-hour payment window** and
an SMS payment link. The cron expires lapsed windows (booking → `CANCELLED`)
and promotes the next member. Promotion order is strictly `createdAt asc`.

### Timezone
Africa/Accra is UTC+0 with no DST, so times are stored and rendered as UTC
1:1 — no timezone library needed. This is a deliberate simplification and is
flagged in `src/lib/dates.ts` should the assumption ever break.

### Hand-rolled PDF writer
The approved stack listed no PDF library, and the build rules said to ask
before adding dependencies. Payout statements are text tables, so
`src/lib/pdf.ts` implements a minimal, dependency-free PDF 1.4 writer
(Helvetica regular/bold, automatic pagination, ~100 lines). Verified to
render correctly. Swapping in `pdfkit`/`@react-pdf` later would only touch
`src/app/api/payouts/[id]/pdf/route.ts`.

## 5. Deliberate spec interpretations

These follow the spec's letter where possible and are called out because a
different reading is defensible:

1. **`WALLET` payment method added to the enum.** The spec's enum (`CREDIT |
   MOMO | CARD | CASH | COMP`) had no way to label a booking fully covered by
   wallet balance (which rule 2 creates). Bookings paid partly by wallet and
   partly by cash/MoMo keep the cash method; the Payment row records only the
   freshly collected remainder while the booking carries full price.
2. **Payout eligibility = bookings with money attached.** Rule 5 says
   earnings are "the sum of paid bookings (ATTENDED, or BOOKED on completed
   sessions) … not yet in any PayoutLine". Implemented literally: only
   bookings with `amountGHS > 0` count, at full session price (including any
   wallet-funded portion). Credit- and comp-paid bookings earn the trainer
   nothing. Also note rule 4 converts un-checked bookings to `NO_SHOW` on
   completion, which removes them from eligibility — if paid no-shows should
   still pay trainers, add `NO_SHOW` to `eligibleBookingsWhere` in
   `src/lib/payouts.ts` (one line).
3. **Manual (cash) renewals are detected by the cycle cron** by matching a
   `CONFIRMED` payment whose description contains "renew" with an amount ≥
   the plan price, made during the current cycle. Paystack renewals bypass
   this — the webhook resets the cycle directly.
4. **Unlimited plans** use the spec's `999` sentinel: `creditsLeft >= 999` is
   treated as unlimited and never decremented/refunded.

## 6. What is tested

- **12 Vitest tests** (`tests/business-rules.test.ts`) against an isolated
  `corestudio_test` database, covering the four spec-mandated areas:
  credit consumption (incl. unlimited and zero-credit rejection), waitlist
  promotion order (oldest first; payment window for no-credit members; no
  promotion when full), payout exclusion of already-paid bookings (incl. the
  DB-level double-payout guard), and cancellation cutoff (member blocked
  inside window, refunds on both credit and cash paths).
- **1 Playwright e2e test** (`e2e/booking-flow.spec.ts`): real browser,
  mobile viewport — login → find a bookable class in the 14-day strip →
  book with a credit → verify under My bookings → cancel.
- **Manual verification during the build** (all passed): RBAC redirects,
  front-desk booking + check-in, wallet adjustment, signed/duplicate/forged
  webhook deliveries, renewal credit reset, payout creation + PDF, cron
  idempotency, full waitlist promotion chain, CSV exports, PWA manifest.

## 7. Known limitations / future work

- **Paystack keys in `.env` are dummies** — webhook logic is fully tested,
  but a real checkout redirect needs live test keys and the webhook URL set
  in the Paystack dashboard.
- Partial wallet + Paystack top-up works, but a *failed* charge after a
  wallet reservation simply never debits the wallet (reservation happens at
  webhook time) — safe, but the UX shows no "payment pending" state.
- Trainer photo upload (`photoUrl`) has no upload UI; it's a URL field.
- No rate limiting beyond OTP send/attempt caps; add nginx `limit_req` for
  the auth endpoints in production.
- The e2e suite is a single happy path; the admin portal is covered only by
  unit tests + manual passes.
- `docker compose up` could not be tested on the build machine (Docker
  Desktop broken there); the compose stack follows standard patterns but
  deserves a smoke test on the target VPS.

## 8. Document map

| Document | Contents |
| --- | --- |
| [README.md](../README.md) | Quick start, scripts, deployment |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers, auth/RBAC, request flow, cron, PWA |
| [DATA-MODEL.md](DATA-MODEL.md) | Every model, enum, constraint, and why |
| [API.md](API.md) | Endpoint reference: auth, roles, bodies, errors |
| [OPERATIONS.md](OPERATIONS.md) | Dev setup, tests, deployment runbook, troubleshooting |
