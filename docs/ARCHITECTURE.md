# Architecture

## Layout

```
corestudio/
├── prisma/
│   ├── schema.prisma          # data model (see DATA-MODEL.md)
│   ├── migrations/            # SQL migrations
│   └── seed.ts                # demo data (npm run db:seed)
├── src/
│   ├── app/
│   │   ├── page.tsx           # public landing + live timetable
│   │   ├── login/ signup/ forgot/        # auth pages
│   │   ├── admin/             # staff portal (desktop-first)
│   │   │   ├── layout.tsx     # sidebar, role-aware nav
│   │   │   ├── page.tsx       # dashboard
│   │   │   ├── timetable/ bookings/ members/ trainers/
│   │   │   ├── payments/ payouts/ my-earnings/ reports/ settings/
│   │   ├── app/               # member PWA (mobile-first)
│   │   │   ├── layout.tsx     # bottom tab bar
│   │   │   ├── page.tsx       # home: next booking, today
│   │   │   ├── book/ bookings/ account/ pay/
│   │   ├── api/               # REST endpoints (see API.md)
│   │   ├── manifest.ts        # PWA manifest
│   │   └── sw-register.tsx    # service-worker registration (prod only)
│   ├── auth.ts                # NextAuth: credentials provider (Prisma+bcrypt)
│   ├── auth.config.ts         # edge-safe auth config (JWT role claims)
│   ├── proxy.ts               # route gating (Next 16's middleware)
│   ├── lib/
│   │   ├── booking.ts         # rules 1–4: book/cancel/promote/check-in
│   │   ├── payouts.ts         # rule 5: owed computation, payout creation
│   │   ├── payment-flows.ts   # Paystack checkouts + charge fulfilment
│   │   ├── cron-jobs.ts       # rules 3/4/6/7 scheduled work
│   │   ├── paystack.ts        # API client + webhook signature
│   │   ├── notifications/     # NotificationService (arkesel/hubtel/console)
│   │   ├── otp.ts             # phone OTP issue/verify (hashed, rate-limited)
│   │   ├── rbac.ts            # requireRole(), apiHandler() wrapper
│   │   ├── errors.ts          # ApiError (web-free, importable by domain code)
│   │   ├── audit.ts           # AuditLog writer (transaction-aware)
│   │   ├── money.ts           # pesewas ↔ GHS display
│   │   ├── dates.ts           # UTC(=Accra) helpers
│   │   ├── pdf.ts             # dependency-free PDF writer
│   │   ├── validation.ts      # shared Zod schemas
│   │   └── prisma.ts          # PrismaClient singleton
│   └── types/next-auth.d.ts   # session/JWT role augmentation
├── tests/                     # Vitest (isolated corestudio_test DB)
├── e2e/                       # Playwright booking flow
├── public/sw.js               # service worker
├── Dockerfile  docker-compose.yml  nginx.conf  docker-entrypoint.sh
└── docker-compose.dev.yml     # dev Postgres only
```

## Layering rule

**Routes are thin; domain libraries do the work.**

- Server-component pages read Prisma directly (queries only, no mutations).
- API routes: parse with Zod → `requireRole()` → call a domain function →
  serialize. The `apiHandler()` wrapper converts `ApiError` and `ZodError`
  into proper JSON error responses.
- Domain libraries (`booking.ts`, `payouts.ts`, `payment-flows.ts`,
  `cron-jobs.ts`) contain every business rule, run inside
  `prisma.$transaction`, and write audit entries **in the same transaction**.
  They import nothing from the web layer (`ApiError` lives in `errors.ts`
  for exactly this reason), which is what lets Vitest exercise them against
  a bare database.

## Authentication

- **Email + password**: NextAuth Credentials provider; bcrypt-hashed
  passwords; JWT session strategy.
- **Phone OTP** (`src/lib/otp.ts`): 6-digit codes, bcrypt-hashed at rest,
  10-minute expiry, max 5 verify attempts per code, max 3 sends per
  15 minutes per phone. Used for sign-up phone verification and password
  reset. The send endpoint never reveals whether a phone number exists.
- The JWT carries `{ id, role }`, so authorization decisions need no
  database round-trip.

## Authorization (RBAC)

Roles: `OWNER`, `ADMIN`, `TRAINER`, `MEMBER`. Three enforcement layers:

1. **Edge proxy** (`src/proxy.ts`): `/admin/*` requires a staff role
   (OWNER/ADMIN/TRAINER — members are redirected to `/app`); `/app/*`
   requires any session; signed-out users are redirected to `/login` with a
   `callbackUrl`.
2. **API routes**: every route calls `requireRole([...])`; member-owned
   resources additionally verify ownership (e.g. a member can only cancel
   their own booking).
3. **Pages**: trainer-specific pages re-check the role server-side and
   scope queries (a trainer's timetable is filtered to their own sessions;
   payout PDFs check the payout belongs to the requesting trainer).

Trainers see a reduced portal: Timetable (own sessions + rosters +
check-in) and My earnings only. OWNER additionally gets staff invites.

## Payments flow

```
Member books, no credits/wallet
  → POST /api/app/bookings
      → startBookingCheckout(): PENDING Payment(ref) + Paystack initialize
      → client redirects to authorization_url
Paystack → POST /api/webhooks/paystack  (HMAC-SHA512 verified)
  → handleChargeSuccess(ref):
      Payment CONFIRMED (idempotency gate)
      BOOKING       → capacity re-check → create BOOKED (or wallet-refund + WAITLIST)
      RENEWAL       → reset credits, advance cycleRenewsAt, ACTIVE
      WAITLIST_CLAIM→ WAITLIST → BOOKED within the 2h window (or wallet refund)
  → confirmation SMS
Callback page → GET /api/app/pay/verify?reference=
  → verifies with Paystack; fulfils via the same idempotent handler
    (covers local dev and missed webhooks)
```

## Scheduled work

`POST /api/cron` (Bearer `CRON_SECRET`) runs, in order
(`src/lib/cron-jobs.ts`):

1. `generateSessions` — materialize sessions 4 weeks ahead from
   `RecurrenceRule` templates (idempotent).
2. `completeSessions` — sessions past end time → `COMPLETED`; un-checked
   `BOOKED` → `NO_SHOW`; stale `WAITLIST` → `CANCELLED`.
3. `expireWaitlistOffers` — lapsed 2-hour windows → `CANCELLED`, promote next.
4. `processPlanCycles` — confirmed renewal → credits reset + cycle advance;
   unpaid 3 days past due → `FROZEN` (frozen members cannot book).
5. `sendReminders` — 24h/2h booking SMS, 3-day renewal SMS; deduped via
   `reminder24At`/`reminder2At`/`renewalReminderAt` timestamps.

In production the compose stack's `cron` container fires this every
5 minutes. Any external scheduler (system cron, GitHub Actions, Uptime
Robot) works identically.

## PWA

`src/app/manifest.ts` → `/manifest.webmanifest` (standalone display,
`start_url: /app`, generated icons). `public/sw.js`: cache-first for
immutable `_next/static` assets, network-first with cached fallback for
navigations, an offline page, and **no caching of `/api/*`**. Registered
only in production builds.

## Error handling conventions

- Domain code throws `ApiError(status, message)`; `apiHandler()` maps it to
  `{ error }` JSON with the right status; Zod issues return 400 with details.
- Client components surface `data.error` strings inline next to the control
  that failed.
- The Paystack webhook always returns 200 for verified events (even
  unknown references) so Paystack stops retrying; only signature failures
  get 401.
