# Data Model

Source of truth: [`prisma/schema.prisma`](../prisma/schema.prisma).

**Conventions**

- All money fields are **integer pesewas** (1 GHS = 100 pesewas) despite the
  `GHS` suffix in names. Convert only via `src/lib/money.ts`.
- All timestamps are UTC; Africa/Accra is UTC+0, so stored time == studio
  wall-clock time.
- IDs are cuids.

## Enums

| Enum | Values | Notes |
| --- | --- | --- |
| `Role` | OWNER, ADMIN, TRAINER, MEMBER | On `User` |
| `MemberStatus` | ACTIVE, FROZEN, CANCELLED | FROZEN members cannot book |
| `SessionKind` | CLASS, PT | PT sessions have no class type, capacity 1 by convention |
| `SessionStatus` | SCHEDULED, CANCELLED, COMPLETED | COMPLETED set by cron after end time |
| `BookingStatus` | BOOKED, WAITLIST, ATTENDED, NO_SHOW, CANCELLED | See state machine below |
| `PaymentMethod` | CREDIT, MOMO, CARD, CASH, COMP, **WALLET** | WALLET added beyond the spec: booking fully covered by wallet balance |
| `PaymentStatus` | PENDING, CONFIRMED, FAILED | PENDING rows are created at Paystack checkout time |
| `PayoutStatus` | PENDING, PAID | PAID requires a manual MoMo transfer reference |

## Models

### Studio
Single row. `name`, `currency` (GHS), `momoNumber`, `advanceBookingDays`
(default 14 — length of the member booking window), `cancelCutoffHours`
(default 12 — member self-cancellation deadline), `timezone` (Africa/Accra).

### User
`name`, `email` (unique), `phone` (unique, `phoneVerifiedAt` set by OTP),
`passwordHash` (bcrypt), `role`. One-to-one optional links to `Member` and
`Trainer` profiles.

### OtpCode
Phone verification / password-reset codes: `phone`, `codeHash` (bcrypt),
`purpose`, `expiresAt`, `usedAt`, `attempts`. Indexed on `(phone, purpose)`.

### MembershipPlan
`name`, `priceGHS`, `creditsPerCycle` (**999 = unlimited** sentinel),
`cycleDays` (default 30), `description`, `active`.

### Member
Profile for role=MEMBER users. `planId?`, `status`, `creditsLeft`,
`walletGHS` (refund/credit balance, applied before any new charge),
`cycleRenewsAt`, `renewalReminderAt` (reminder dedupe), `joinedAt`.

### Trainer
Profile for role=TRAINER users. `specialty`, `commissionPercent` (integer
percent), `ptRateGHS` (default PT session price), `calendarColor`, `bio`,
`photoUrl?`.

### ClassType
Template for classes: `name`, `durationMins`, `priceGHS` (drop-in price),
`defaultCapacity`, `description`, `active`.

### RecurrenceRule
Weekly timetable template: `dayOfWeek` (0=Sun…6=Sat), `time` ("HH:mm"),
`classTypeId`, `trainerId`, `capacity?` (falls back to the class type's
default), `active`. The cron materializes sessions 4 weeks ahead from these.

### Session
A concrete occurrence: `kind`, `classTypeId?` (null for PT), `trainerId`,
`startsAt`, `durationMins`, `capacity`, `priceGHS` (snapshotted from the
class type / PT rate at creation), `status`, `recurrenceRuleId?`.

Constraints: `@@unique([recurrenceRuleId, startsAt])` makes cron generation
idempotent; indexed on `startsAt` and `(trainerId, startsAt)`.

### Booking
`sessionId`, `memberId`, `status`, `paidWith?`, `amountGHS` (full session
price for money-paid bookings, 0 for CREDIT/COMP/WAITLIST), `paystackRef?`
(unique), `promotionExpiresAt?` (2-hour waitlist payment window),
`reminder24At`/`reminder2At` (SMS dedupe), `createdAt` (waitlist promotion
order).

State machine:

```
            capacity free                    capacity full
new ───────────► BOOKED                new ───► WAITLIST
                   │  │                            │
        check-in   │  │ cancel            spot opens│
                   ▼  ▼                            ▼
             ATTENDED CANCELLED   credits? ──► BOOKED
                   │                  no credits ─► WAITLIST + promotionExpiresAt
   session ends,   │                                  │ paid in 2h → BOOKED
   never checked in▼                                  │ expired    → CANCELLED
               NO_SHOW (via cron)
```

### Payment
Money actually collected (or pending collection): `memberId`, `amountGHS`,
`method`, `description`, `paystackRef?` (unique — the idempotency key for
webhook fulfilment), `status`. Note: for a booking paid partly from wallet,
the Payment records only the freshly collected remainder; the Booking
carries the full price.

### Payout / PayoutLine
`Payout`: `trainerId`, `periodStart`/`periodEnd` (span of included booking
sessions), `grossGHS`, `commissionPercent` (snapshotted), `amountGHS`
(floor of gross × percent / 100), `status`, `paidAt`, `reference` (manual
MoMo transfer ID).

`PayoutLine`: `payoutId`, `bookingId` with a **unique constraint on
`bookingId`** — the database-level guarantee that a booking is paid out at
most once, ever.

Payout eligibility (`src/lib/payouts.ts`): `amountGHS > 0` AND
(`ATTENDED`, or `BOOKED` on a `COMPLETED` session) AND no existing
PayoutLine, scoped to the trainer's sessions.

### AuditLog
`userId?` (null for system/cron actions), `action` (dot-namespaced, e.g.
`booking.create`, `payout.mark_paid`), `entity`, `entityId`, `payload`
(JSON), `createdAt`. Written inside the same transaction as every mutation.
Indexed on `(entity, entityId)` and `createdAt`.
