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

export const updateSessionSchema = z.object({
  action: z.enum(["CANCEL"]),
});

export const createBookingSchema = z.object({
  sessionId: z.string().min(1),
  memberId: z.string().min(1),
  // Front desk can take cash/comp; CREDIT consumes a plan credit.
  paidWith: z.enum(["CREDIT", "CASH", "COMP", "MOMO", "CARD"]).default("CREDIT"),
});

export const updateBookingSchema = z.object({
  action: z.enum(["CHECK_IN", "CANCEL", "NO_SHOW"]),
});

export const createMemberSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  phone: z.string().min(9).max(20),
  planId: z.string().optional(),
  password: z.string().min(8).max(200).optional(),
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
