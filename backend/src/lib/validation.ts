import { z } from "zod";

export const idSchema = z.string().min(1);

export const createSessionSchema = z.object({
  kind: z.enum(["CLASS", "PT"]).default("CLASS"),
  classTypeId: z.string().optional(),
  trainerId: z.string().min(1),
  locationId: z.string().min(1),
  startsAt: z.coerce.date(),
  durationMins: z.number().int().positive(),
  capacity: z.number().int().positive(),
  priceGHS: z.number().int().nonnegative(), // pesewas
  // When set, also create a weekly RecurrenceRule from this session's slot
  recurring: z.boolean().default(false),
});

export const updateSessionSchema = z.union([
  z.object({ action: z.enum(["CANCEL"]), mode: z.enum(["REFUND", "RESCHEDULE"]).default("REFUND") }),
  z.object({
    trainerId: z.string().min(1).optional(),
    locationId: z.string().min(1).optional(),
    startsAt: z.coerce.date().optional(),
    capacity: z.number().int().positive().optional(),
    priceGHS: z.number().int().nonnegative().optional(),
  }),
]);

export const createBookingSchema = z.object({
  sessionId: z.string().min(1),
  memberId: z.string().min(1),
  // Front desk can take cash/comp; CREDIT consumes a plan credit; PACKAGE
  // consumes a session from a matching MemberPackage (bookSession() 404s if
  // the member has none for this session's class type).
  paidWith: z.enum(["CREDIT", "PACKAGE", "CASH", "COMP", "MOMO", "CARD"]).default("CREDIT"),
});

export const updateBookingSchema = z.object({
  action: z.enum(["CHECK_IN", "CANCEL", "NO_SHOW"]),
});

export const createMemberSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  phone: z.string().min(9).max(20),
  planId: z.string().optional(),
  password: z.string().min(8).max(200),
});

export const updateMemberSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().min(9).max(20).optional(),
  planId: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "FROZEN", "CANCELLED"]).optional(),
  creditsLeft: z.number().int().min(0).optional(),
  // Positive or negative adjustment in pesewas, applied to walletGHS
  walletAdjustGHS: z.number().int().optional(),
});
