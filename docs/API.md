# API Reference

All endpoints are JSON over HTTPS. Every route validates its body with Zod,
checks authentication and role, and writes an audit log for mutations.
Errors return `{ "error": string }` with an appropriate status (400
validation, 401 unauthenticated, 403 wrong role, 404 not found, 409
conflict, 429 rate-limited).

Roles column: **O**=OWNER, **A**=ADMIN, **T**=TRAINER, **M**=MEMBER,
**–**=public.

## Auth & account

| Method | Path | Roles | Body / notes |
| --- | --- | --- | --- |
| * | `/api/auth/[...nextauth]` | – | NextAuth (login `POST /api/auth/callback/credentials`, signout, session) |
| POST | `/api/signup` | – | `{ name, email, phone, password }` → creates MEMBER + sends OTP. 409 on duplicate email/phone |
| POST | `/api/otp` | – | `{ action: "SEND", phone, purpose }` or `{ action: "VERIFY", phone, purpose, code }`; purposes: `VERIFY_PHONE`, `RESET_PASSWORD`. Send is rate-limited (3 / 15 min); verify allows 5 attempts |
| POST | `/api/password-reset` | – | `{ phone, code, newPassword }` |
| PATCH | `/api/app/profile` | any | `{ name?, currentPassword?, newPassword? }` |

## Member app

| Method | Path | Roles | Body / notes |
| --- | --- | --- | --- |
| POST | `/api/app/bookings` | M | `{ sessionId }`. Server picks the source: credits → wallet → Paystack. Returns `201 { booking }` (BOOKED or WAITLIST) or `200 { authorizationUrl }` for checkout redirect |
| PATCH | `/api/app/bookings/[id]` | M (owner) | `{ action: "CANCEL" }` — enforced against `cancelCutoffHours`; refunds credit or wallet |
| POST | `/api/app/renew` | M | `{}` → `{ authorizationUrl }` Paystack checkout for the member's plan |
| GET | `/api/app/pay/verify?reference=` | any | Verifies a Paystack reference and fulfils it if paid (idempotent with the webhook) |

## Staff — sessions & bookings

| Method | Path | Roles | Body / notes |
| --- | --- | --- | --- |
| POST | `/api/sessions` | O A | `{ kind, classTypeId?, trainerId, startsAt, durationMins, capacity, priceGHS, recurring }`. `recurring: true` creates a weekly `RecurrenceRule` + 4 weeks of sessions |
| PATCH | `/api/sessions/[id]` | O A | `{ action: "CANCEL" }` — refunds/releases every booking, SMS to members |
| POST | `/api/bookings` | O A | Front-desk booking: `{ sessionId, memberId, paidWith }` (`CREDIT/CASH/MOMO/CARD/COMP`); wallet applies first on money methods |
| PATCH | `/api/bookings/[id]` | O A T | `{ action: "CHECK_IN" \| "NO_SHOW" \| "CANCEL" }` |

## Staff — people & money

| Method | Path | Roles | Body / notes |
| --- | --- | --- | --- |
| POST | `/api/members` | O A | `{ name, email, phone, planId?, password? }` — credits set from plan |
| PATCH | `/api/members/[id]` | O A | `{ name?, phone?, planId?, status?, creditsLeft?, walletAdjustGHS? }` — plan change resets credits; wallet adjust is a ± pesewas increment |
| POST | `/api/trainers` | O A | `{ name, email, phone, specialty?, commissionPercent?, ptRateGHS?, calendarColor?, bio? }` |
| PATCH | `/api/trainers/[id]` | O A | Any of the trainer profile fields |
| POST | `/api/payments` | O A | Record manual payment: `{ memberId, amountGHS, method: CASH/MOMO/CARD, description }` → CONFIRMED |
| POST | `/api/payouts` | O A | `{ trainerId }` — atomically creates the Payout + PayoutLines for everything owed. 400 if nothing owed |
| PATCH | `/api/payouts/[id]` | O A | `{ action: "MARK_PAID", reference }` — manual MoMo transfer ID |
| GET | `/api/payouts/[id]/pdf` | O A T (own) | PDF statement download |

## Staff — configuration & reporting

| Method | Path | Roles | Body / notes |
| --- | --- | --- | --- |
| PATCH | `/api/settings` | O A | `{ name?, momoNumber?, advanceBookingDays?, cancelCutoffHours? }` |
| POST / PATCH | `/api/plans` | O A | Create / update (`PATCH` takes `{ id, ...fields, active? }`) |
| POST / PATCH | `/api/class-types` | O A | Create / update (same pattern) |
| POST | `/api/staff` | O only | `{ name, email, phone, role: ADMIN\|OWNER }` — temp password sent by SMS |
| GET | `/api/reports/csv?table=` | O A | `bookings \| payments \| members \| sessions \| payouts` → CSV download |

## Machine endpoints

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/webhooks/paystack` | `x-paystack-signature` (HMAC-SHA512 of raw body with the secret key) | Handles `charge.success`; idempotent on the payment reference; always 200 for verified events, 401 for bad signatures |
| POST | `/api/cron` | `Authorization: Bearer <CRON_SECRET>` | Runs all scheduled jobs; returns per-job counts. Safe to call as often as every minute |
