# How CoreStudio (P4Studio) actually works

This is a plain-language walkthrough of the three apps, how they talk to each
other, and what happens end-to-end when a member books and pays for a class.
For folder-by-folder specifics see the root [README.md](../README.md).

## The three apps, in one paragraph each

- **`backend/`** — a Next.js app that is *only* a REST API. It owns the
  Postgres database (via Prisma) and every piece of business logic: booking
  rules, payments, payouts, cron jobs. Nothing else touches the database
  directly except...
- **`admin/`** — a Next.js app for staff (owners, admins, trainers). It's a
  normal server-rendered website. For reading data it imports `backend`'s
  Prisma/lib code **directly** (same process trick, not a network call) —
  that's why `admin/next.config.ts` has a path alias into `../backend`. For
  writes triggered from the browser (buttons, forms) it calls `backend`'s
  REST API over HTTP, proxied transparently through `admin/src/proxy.ts` so
  the browser never needs to know `backend` exists on a different port.
- **`mobile/`** — the Expo/React Native app members install. It **only**
  talks to `backend` over HTTP, using `/api/app/**` endpoints. It never
  touches Prisma or the database directly — it can't, it's not a Node
  process with DB access, it's a phone.

```
┌─────────────┐        HTTP (bearer JWT)        ┌─────────────┐
│   mobile/   │ ───────────────────────────────▶│             │
│ (RN/Expo)   │◀─────────────────────────────── │  backend/   │
└─────────────┘                                  │  (REST API  │
                                                  │  + Prisma + │
┌─────────────┐   direct import (RSC reads)      │  Postgres)  │
│   admin/    │ ───────────────────────────────▶│             │
│ (staff web) │◀─────────────────────────────── │             │
└─────────────┘   HTTP via proxy (writes)         └─────────────┘
```

In production, nginx sits in front of everything on one domain: it forwards
all traffic to `admin`, and `admin` itself forwards `/api/*` on to `backend`
internally (see `docker-compose.yml`). Members' phones talk to `backend`
directly (there's no reason to route mobile traffic through `admin`).

## Two different logins, on purpose

- **Staff (`admin`)**: NextAuth session cookie. Sign in at `/login`, a
  cookie gets set, every admin page/request checks that cookie.
- **Members (`mobile`)**: no cookies (phones don't really do cookies well
  for this). Instead, `POST /api/app/auth/login` returns a **JWT** the app
  stores in SecureStore and sends as `Authorization: Bearer <token>` on
  every request. See `backend/src/lib/mobile-auth.ts` and
  `backend/src/lib/rbac.ts`'s `requireMobileAuth()`.

These two are completely independent — a staff member logging into `admin`
and a member logging into `mobile` are unrelated events, even if (in theory)
the same person had both a staff and a member account.

## Membership plans vs. single-class bookings — the thing that's confusing

These are **two separate concepts** that both happen to involve money:

1. **A `MembershipPlan`** (e.g. "Unlimited", "8-classes-a-month") is a
   recurring bucket of credits a member is subscribed to. It has
   `creditsPerCycle` (how many classes it includes) and `cycleDays` (usually
   30 — i.e. "a month"). A member can pick one themselves from the mobile
   **Plans** screen (`mobile/app/plans.tsx`, reached from Home), or staff can
   assign one via the admin Members page — both paths end up doing the same
   thing (see "Buying or switching a plan" below). Once a member has a plan,
   tapping **Renew** in the app (Profile tab) pays for *another cycle* of
   that same plan and adds another batch of credits.

2. **Booking a class** (Timetable → tap a class → Book) is booking *that one
   session, on that one day, at that one time*. It is not a subscription
   action. What it *costs* the member depends on what they have available,
   checked in this order (see `backend/src/app/api/app/bookings/route.ts`):
   - They have plan credits left → uses **1 credit**, no charge.
   - The class is free → free.
   - Their wallet balance covers it → paid from wallet, no new charge.
   - Otherwise → a **one-off Paystack payment for just that class's price**.

So: a member with an active "Unlimited" plan just taps Book and it silently
consumes 1 credit each time — no payment screen appears at all. A member
with **no plan** (like a brand-new signup) will hit real Paystack checkout
**every single time they book a class**, because they have no credits and no
wallet balance to draw from. That's expected, not a bug — it's the
"pay-as-you-go" fallback for people without a subscription.

**A booking never automatically "covers a month."** The only thing that
represents "a month" is the plan's renewal cycle; individual bookings are
always for one session.

## Booking + payment, end to end

Walking through what happens when a no-plan member books a ¢150 class:

1. **Mobile** (`app/session/[id].tsx`) calls
   `POST /api/app/bookings { sessionId }` with their bearer token.
2. **Backend** (`src/app/api/app/bookings/route.ts`) checks: full? has
   credits? free? wallet covers it? None of those — so it calls
   `startBookingCheckout()` (`src/lib/payment-flows.ts`), which:
   - Creates a `Payment` row with `status: "PENDING"` and a fresh reference
     (e.g. `bk_a09da1...`).
   - Calls Paystack's `/transaction/initialize` with the member's email,
     name and phone (so the checkout page and Paystack's own dashboard show
     who's paying, not just an email address) and a `callback_url` pointing
     back at `backend`.
   - Returns `{ authorizationUrl, reference }` to the phone.
   - **No `Booking` row exists yet at this point.** Only a pending payment.
3. **Mobile** opens `authorizationUrl` in an **in-app modal**
   (`components/CheckoutModal.tsx` — a `WebView` inside a native sheet, not
   the system browser) so it feels like part of the app rather than
   handing off to Safari/Chrome.
4. The member enters card or Mobile Money details **on Paystack's page**
   (we never see or touch card numbers). Two independent things can confirm
   the payment happened:
   - **Paystack's webhook** (`POST /api/webhooks/paystack`) — Paystack's
     servers call this the moment payment succeeds. This only works if
     `backend` has a real public HTTPS URL Paystack can reach — it will
     **not** fire against `http://localhost`, which matters for local
     testing (see the gotcha below).
   - **The app's own verify call** — once the WebView navigates to
     `backend`'s `/api/app/pay/callback` (Paystack's redirect target), the
     modal detects that URL and closes itself, handing the `reference` back
     to the screen, which calls `GET /api/app/pay/verify?reference=...`.
     This does a live "did this actually succeed?" check straight against
     Paystack's API — it doesn't depend on the webhook at all.
5. Whichever of those two fires first calls `handleChargeSuccess()`
   (`src/lib/payment-flows.ts`), which is **idempotent** — it's fine if both
   eventually fire, the second one is a no-op. This is where the `Booking`
   row actually gets created (status `BOOKED`), and the `Payment` row flips
   to `status: "CONFIRMED"`.
6. Mobile shows "You're booked!" and the admin Payments page — which reads
   the exact same database row, live, no caching — shows `CONFIRMED` too.

### The bug this project actually hit (fixed 2026-08-04)

Every real test payment during development stayed stuck at `PENDING` in
both the app and the admin portal. Root cause, found by checking the
`Payment` table directly: `CheckoutModal`'s predecessor
(`WebBrowser.openAuthSessionAsync(url, undefined)`) was called **without a
redirect URL to watch for**, so it never auto-detected that checkout had
finished — the verify call the app was supposed to make afterward wasn't
reliably wired to actually fire at the right moment. Switching to the
in-app `CheckoutModal` (which watches WebView navigation directly instead
of relying on the system browser's redirect handling) fixes this — see
`mobile/components/CheckoutModal.tsx`.

If you ever see `PENDING` payments pile up again, the first thing to check
is: did `GET /api/app/pay/verify?reference=...` actually get called for
that reference? `docker compose logs backend` will show a
`Paystack verify failed` line if it did fire and Paystack rejected it, and
you can call the same endpoint by hand with `curl` to reproduce.

## Buying or switching a plan (updated 2026-08-05)

A member picks a plan on the mobile **Plans** screen and has two ways to pay
for it — both end up calling the same activation logic, so the outcome is
identical either way:

1. **Pay with Paystack** — `POST /api/app/plans/:id/subscribe` with no body
   starts a Paystack checkout, exactly like booking a class (same in-app
   `CheckoutModal`, same webhook/verify race described above). On success,
   `handleChargeSuccess()`'s `RENEWAL` branch fires.
2. **Pay with cash** — `POST /api/app/plans/:id/subscribe { "method": "cash" }`
   instead creates a `Payment` row with `status: "PENDING"`, `method: "CASH"`,
   and `planId` set to the chosen plan — no Paystack involved at all. The
   member sees "show up and pay in person." That payment then sits on the
   admin **Payments** page with a **"Confirm cash received"** button (only
   shown for pending cash rows). When a staff member taps it — after the
   member has actually paid at the front desk —
   `POST /api/payments/:id/confirm-cash` flips the payment to `CONFIRMED`.

Both paths converge on the same function, **`activateMembership()`**
(`backend/src/lib/payment-flows.ts`): it sets `Member.planId` to the chosen
plan, sets status to `ACTIVE`, and — this is the important part —
**increments `creditsLeft` by the plan's `creditsPerCycle` instead of
overwriting it.** So switching plans, renewing early, or re-subscribing
while credits are still left never wipes out unused credits; it stacks on
top. `cycleRenewsAt` extends from whichever is later: the member's current
renewal date (if still in the future) or now.

Staff can also assign/change a plan directly from a member's admin detail
page with no payment involved at all (`PATCH /api/members/:id`,
`admin/src/app/admin/members/member-forms.tsx`'s "Plan & status" editor).
That path does **not** go through `activateMembership()` — it's a manual
override, and unlike the two payment-driven paths above it **overwrites**
`creditsLeft` to the new plan's `creditsPerCycle` rather than adding to it
(`backend/src/app/api/members/[id]/route.ts`). That's intentional: it's for
staff directly correcting/setting a member's state ("this person should
just have exactly N credits on this plan"), not for recording a purchase —
if you want the additive behavior, the payment paths above are the ones to
use.

## Cancelling and the waitlist

- Members can cancel a `BOOKED` class themselves up until
  `Studio.cancelCutoffHours` (default 12h) before it starts.
- New: members **cannot book** a class within `Studio.bookingCutoffMinutes`
  (default 45 minutes) of its start time at all — the Book button greys out
  and the backend rejects it either way (`bookSession()` in
  `src/lib/booking.ts`). Staff booking someone in at the front desk (admin
  portal) bypasses this — the cutoff only applies to members self-booking.
- If a class is full, booking puts the member on the `WAITLIST` instead.
  When a spot opens (someone cancels), `promoteWaitlist()` either
  auto-confirms the next person (if they have credits) or SMS's them a
  2-hour payment window to claim it — which is the same Paystack checkout
  flow as above, just triggered by `POST /api/app/bookings/:id/claim`.

## One studio only, for now — no multi-owner isolation

The whole codebase is **single-tenant**. `Studio` in the database is one
settings row, not a table of many studios; `Member`, `Booking`, `Payment`,
`Session`, etc. have no `studioId`/`ownerId` column; and `requireRole()`
(`backend/src/lib/rbac.ts`) only checks *role* (`OWNER`/`ADMIN`/`TRAINER`),
never *which* studio. So today, every `OWNER`/`ADMIN` account sees the exact
same one shared set of members, bookings, and payments — there's no wall
between "owners."

If this ever needs to support multiple independent studio owners each with
their own isolated members/mobile-app users (with a platform-level admin
able to see across all of them), that's a real multi-tenant conversion —
every business table needs a studio/owner ID, every query needs to filter by
it, auth (both the NextAuth session and the mobile JWT) needs to carry which
studio it belongs to, and a role needs to exist above `OWNER` for the
platform operator. Not started; see conversation history from 2026-08-05 for
the fuller breakdown of what that would take.

## Admin portal UX notes (2026-08-05)

- Sidebar (`admin/src/app/admin/layout.tsx`) is fixed — the outer shell is
  `h-screen overflow-hidden`, and only the `{children}` content pane
  scrolls (`overflow-y-auto`), so the nav never scrolls out of view even on
  long pages.
- Bookings, Payments, and Payouts already listed newest-first
  (`orderBy: { createdAt: "desc" }`); Members now does too
  (`orderBy: { joinedAt: "desc" }`, was alphabetical) — so new signups,
  bookings, and payments always surface at the top without staff having to
  hunt for them.

## Where things live, if you need to change something

| I want to change... | Look at |
|---|---|
| What happens when someone taps Book | `backend/src/app/api/app/bookings/route.ts`, `backend/src/lib/booking.ts` |
| The Paystack checkout UI on the phone | `mobile/components/CheckoutModal.tsx` |
| How long before class booking closes | `Studio.bookingCutoffMinutes` (Prisma) — currently only settable via DB/seed, not yet an admin UI field |
| What a member sees in Payment history | `backend/src/app/api/app/profile/route.ts` (GET), `mobile/app/payment/[id].tsx` |
| Buying/switching a plan on mobile | `mobile/app/plans.tsx`, `backend/src/app/api/app/plans/[id]/subscribe/route.ts` |
| Plan/cash activation logic (shared) | `activateMembership()` in `backend/src/lib/payment-flows.ts` |
| Confirming a pending cash payment | `backend/src/app/api/payments/[id]/confirm-cash/route.ts`, `admin/src/app/admin/payments/confirm-cash-button.tsx` |
| Staff-side payments list | `admin/src/app/admin/payments/page.tsx` |
| Mobile login/signup | `mobile/app/login.tsx`, `mobile/app/signup.tsx`, `backend/src/lib/mobile-auth.ts` |
| Admin login | `admin/src/auth.ts`, `admin/src/app/login` |
| Sidebar / page-scroll layout | `admin/src/app/admin/layout.tsx` |

