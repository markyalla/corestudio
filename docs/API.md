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
| POST | `/api/owner-signup` | – | `{ name, email, password, phone? }` → first web registrant becomes OWNER + creates the Studio row. 403 once an owner exists |
| POST | `/api/signup` | – | `{ name, email, phone, password }` → creates MEMBER (no OTP — SMS provider not wired). 409 on duplicate email/phone, 503 before the studio is set up |
| POST | `/api/set-password` | – | `{ email, currentPassword, newPassword }` → self-service password change; the current password authenticates it (no session, no OTP) |
| POST | `/api/otp` | – | `{ action: "SEND", phone, purpose }` or `{ action: "VERIFY", phone, purpose, code }`; purposes: `VERIFY_PHONE`, `RESET_PASSWORD`. Dormant until an SMS provider is configured |
| POST | `/api/password-reset` | – | `{ phone, code, newPassword }` — OTP-based; dormant until an SMS provider is configured |
| PATCH | `/api/app/profile` | any | `{ name?, currentPassword?, newPassword?, preferredLocationId? }` |

## Member app

| Method | Path | Roles | Body / notes |
| --- | --- | --- | --- |
| POST | `/api/app/bookings` | M | `{ sessionId, method? }`. Default: credits → wallet → Paystack (`200 { authorizationUrl }`) → `201 { booking }`. `method: "cash"` → `201 { booking, cash: true }` with a PENDING cash Payment for staff to confirm |
| PATCH | `/api/app/bookings/[id]` | M (owner) | `{ action: "CANCEL" }` — enforced against `cancelCutoffHours`; refunds credit or wallet |
| POST | `/api/app/renew` | M | `{ method? }` → `{ authorizationUrl }` Paystack checkout, or `{ cash: true, paymentId }` with `method: "cash"` (staff confirm) |
| GET | `/api/app/pay/verify?reference=` | any | Verifies a Paystack reference and fulfils it if paid (idempotent with the webhook) |
| GET | `/api/app/progress` | M | Attendance stats + a tier (`GETTING_STARTED\|THRIVING\|ON_TRACK\|SLIPPING\|INACTIVE`) with `headline`, `message`, `tips[]` for the Home screen |
| GET | `/api/app/motivation` | M | `{ text }` — today's motivational line (rotates one per calendar day through the active pool); `text` is null when the pool is empty |
| GET | `/api/app/pt` | M | Private-class offerings: one entry per trainer with active windows, each with the concrete days + open time ranges (booked slots and clashing classes already subtracted). Filtered to the member's preferred location |
| POST | `/api/app/pt/book` | M | `{ trainerId, date, startTime, method? }` — creates a PT session at the chosen time inside a window, then pays (credit → wallet → Paystack, or `method:"cash"`). **409** if the slot was taken by another member or now clashes with a class — pick another time |

## Staff — sessions & bookings

| Method | Path | Roles | Body / notes |
| --- | --- | --- | --- |
| POST | `/api/sessions` | O A | `{ kind, classTypeId?, trainerId, startsAt, durationMins, capacity, priceGHS, recurring }`. `recurring: true` creates a weekly `RecurrenceRule` + 4 weeks of sessions |
| PATCH | `/api/sessions/[id]` | O A | `{ action: "CANCEL", mode?: "REFUND" \| "RESCHEDULE" }` (default `REFUND`) — releases every booking and SMS's members; `REFUND` returns credit/wallet, `RESCHEDULE` grants a class credit instead of cash back |
| POST | `/api/bookings` | O A | Front-desk booking: `{ sessionId, memberId, paidWith }` (`CREDIT/CASH/MOMO/CARD/COMP`); wallet applies first on money methods |
| PATCH | `/api/bookings/[id]` | O A T | `{ action: "CHECK_IN" \| "NO_SHOW" \| "CANCEL" }` |

## Staff — people & money

| Method | Path | Roles | Body / notes |
| --- | --- | --- | --- |
| POST | `/api/members` | O A | `{ name, email, phone, planId?, password }` — owner/admin sets the password; credits set from plan |
| PATCH | `/api/members/[id]` | O A | `{ name?, phone?, planId?, status?, creditsLeft?, walletAdjustGHS? }` — plan change resets credits; wallet adjust is a ± pesewas increment |
| POST | `/api/trainers` | O A | `{ name, email, phone, password, specialty?, commissionPercent?, ptCommissionPercent?, ptRateGHS?, calendarColor?, bio? }` |
| PATCH | `/api/trainers/[id]` | O A | Any of the trainer profile fields |
| GET / POST / PATCH | `/api/trainers/[id]/pt-windows` | O A | Private-class availability windows: `{ dayOfWeek, startTime, endTime, locationId, durationMins?, title?, priceGHS? }`. **409** if the window overlaps a class the trainer is assigned that weekday, or another of their windows. Staff-only — trainers no longer self-manage this (see `/api/trainer-requests`) |
| GET / POST / DELETE | `/api/trainers/[id]/unavailability` | O A | Whole-day blackout dates: `{ dates[] }` or `{ startDate, endDate }`. Staff-only, same reason |
| GET / POST | `/api/trainer-requests` | O A T | A trainer flags a scheduling problem instead of editing the calendar: `{ type: "CANCEL_SESSION" \| "UNAVAILABLE", sessionId?, message }`. GET returns everyone's requests for O/A, only the caller's own for T |
| PATCH | `/api/trainer-requests/[id]` | O A | `{ action: "CANCEL_SESSION" \| "DISMISS", mode?: "REFUND" \| "RESCHEDULE" }` — `CANCEL_SESSION` calls the session cancel above; `DISMISS` just closes the request |
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
| POST / PATCH | `/api/motivation` | O A | Curate the daily-motivation pool. `POST { text }`; `PATCH { id, text?, active? }` |
| POST | `/api/staff` | O only | `{ name, email, phone, role: ADMIN\|OWNER\|TRAINER, password }` — owner sets the password; the staffer changes it at `/set-password`. `TRAINER` also gets a default `Trainer` profile |
| GET | `/api/members/phones?audience=all\|active` | O only | `{ count, phones[], joined }` — member phone numbers only (no names), for pasting into a WhatsApp broadcast list |
| GET | `/api/reports/csv?table=` | O A | `bookings \| payments \| members \| sessions \| payouts` → CSV download |

## Machine endpoints

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/webhooks/paystack` | `x-paystack-signature` (HMAC-SHA512 of raw body with the secret key) | Handles `charge.success`; idempotent on the payment reference; always 200 for verified events, 401 for bad signatures |
| POST | `/api/cron` | `Authorization: Bearer <CRON_SECRET>` | Runs all scheduled jobs; returns per-job counts. Safe to call as often as every minute |
