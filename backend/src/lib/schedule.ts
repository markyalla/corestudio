// The studio's live weekly class timetable (S2, Airport, Cantonments) — from
// the September schedule PDFs. Used by both `prisma db seed` and
// `npm run db:import-schedule` so the two never drift.
//
// This is a *recurring* weekly schedule with no start/end date: applySchedule()
// installs the RecurrenceRule rows and the caller runs generateSessions() to
// materialise the rolling session window from today.

import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// September 2026 update: added the Clan 7 location (private Pilates/Physio/
// massage studio — see SCHEDULE_TRAINERS' Darlene/Ramiro/ptRateGHS) alongside
// the existing three group-class locations.
export const SCHEDULE_LOCATIONS = ["S2", "Airport", "Cantonments", "Clan 7"] as const;
export type ScheduleLocation = (typeof SCHEDULE_LOCATIONS)[number];

// Address/phone from the studio's pricing PDF footers, shown to members for
// directions/help. Airport and Clan 7 each list two numbers on the PDF —
// phone holds the primary one; the front-desk one is the same for both.
export const SCHEDULE_LOCATION_DETAILS: Record<ScheduleLocation, { address: string; phone: string }> = {
  Airport: { address: "1st Floor, The Anchor Bldg, 51 John Churcher LP.", phone: "+233 55 720 2333" },
  Cantonments: { address: "1st Floor, Above Fairway, 5th Circular Road Ext.", phone: "+233 20 922 1835" },
  S2: { address: "9 Spintex Road, Spintex", phone: "+233 20 922 1835" },
  "Clan 7": { address: "150 Osu Badu Street, Airport Residential", phone: "+233 55 662 7156" },
};

// Colors match each trainer's swatch in the September 2026 schedule PDFs
// (Mat/Yoga + Reformer grids). Darlene and Ramiro are Clan 7 physio/Pilates
// trainers only — no weekly group-class slot, hence no SCHEDULE_RULES entry —
// so their color only shows up wherever the app lists trainers directly.
// ptRateGHS (pesewas) is each trainer's single private-session rate, best-effort
// mapped from the Clan 7 pricing PDF where they teach more than one priced
// service — the schema only holds one PT rate per trainer, so the pack
// discounts (5-session/7-get-1-free/etc.) and per-service pricing on that PDF
// aren't fully representable here; 0 = no private-session rate listed.
// Phone numbers follow the same "+233244000XXX" placeholder pattern already
// used for the dev-fixture trainers in seed.ts (…010/011/012) — just
// continuing the last-two-digit counter so every trainer gets a unique one.
export const SCHEDULE_TRAINERS = [
  { key: "Amale", email: "amale@p4pilates.studio", phone: "+233244000013", color: "#868e96", specialty: "Reformer & Mat Pilates", ptRateGHS: 0 },
  { key: "Irene", email: "irene@p4pilates.studio", phone: "+233244000014", color: "#364fc7", specialty: "Mat Pilates & Yoga", ptRateGHS: 0 },
  { key: "Maryam", email: "maryam@p4pilates.studio", phone: "+233244000015", color: "#e64980", specialty: "Reformer & Mat Pilates", ptRateGHS: 105000 },
  { key: "Grace", email: "grace@p4pilates.studio", phone: "+233244000016", color: "#f59f00", specialty: "Mat Pilates", ptRateGHS: 0 },
  { key: "Albert", email: "albert@p4pilates.studio", phone: "+233244000017", color: "#ab7a3c", specialty: "Reformer Pilates (Advanced) & Physiotherapy", ptRateGHS: 80000 },
  { key: "Youmna", email: "youmna@p4pilates.studio", phone: "+233244000018", color: "#2b8a3e", specialty: "Reformer Pilates", ptRateGHS: 0 },
  { key: "Darlene", email: "darlene@p4pilates.studio", phone: "+233244000019", color: "#0c8599", specialty: "Physiotherapy & Physio Pilates", ptRateGHS: 90000 },
  { key: "Ramiro", email: "ramiro@p4pilates.studio", phone: "+233244000020", color: "#7048e8", specialty: "Musculoskeletal & Sports Physiotherapy", ptRateGHS: 80000 },
] as const;

export const SCHEDULE_CLASS_TYPES = [
  { name: "Reformer Group Class", priceGHS: 45000, durationMins: 50, defaultCapacity: 8, description: "Pilates on equipment — full-body reformer group class." },
  { name: "Reformer Group Class (S2)", priceGHS: 36000, durationMins: 50, defaultCapacity: 8, description: "Pilates on equipment — reformer group class at the S2 studio." },
  // Youmna's own reformer sessions are priced lower than the other trainers'
  // — 300 GHS vs 450 GHS per the September Airport schedule PDF.
  { name: "Reformer Group Class (Youmna)", priceGHS: 30000, durationMins: 50, defaultCapacity: 8, description: "Pilates on equipment — reformer group class with Youmna." },
  { name: "Mat Pilates", priceGHS: 15000, durationMins: 60, defaultCapacity: 15, description: "Core strength and stability on the mat, with props." },
  { name: "Yin Yoga", priceGHS: 15000, durationMins: 60, defaultCapacity: 15, description: "Floor-based, long-held poses for deep release and focus." },
] as const;

// [locationKey, classTypeName, dayOfWeek (1=Mon..6=Sat), "HH:mm", trainerKey]
type ScheduleRule = [ScheduleLocation, string, number, string, string];

export const SCHEDULE_RULES: ScheduleRule[] = [
  // ── S2 — Reformer Group Class (S2), 360 GHS ──────────────────────────────
  ["S2", "Reformer Group Class (S2)", 2, "08:30", "Amale"],
  ["S2", "Reformer Group Class (S2)", 4, "08:30", "Amale"],
  ["S2", "Reformer Group Class (S2)", 5, "08:30", "Amale"],
  ["S2", "Reformer Group Class (S2)", 3, "10:30", "Amale"],
  ["S2", "Reformer Group Class (S2)", 4, "10:30", "Amale"],
  ["S2", "Reformer Group Class (S2)", 1, "11:30", "Amale"],
  ["S2", "Reformer Group Class (S2)", 2, "11:30", "Amale"],
  ["S2", "Reformer Group Class (S2)", 5, "11:30", "Amale"],
  ["S2", "Reformer Group Class (S2)", 6, "11:30", "Amale"],
  ["S2", "Reformer Group Class (S2)", 6, "12:30", "Irene"],
  ["S2", "Reformer Group Class (S2)", 1, "17:00", "Irene"],
  ["S2", "Reformer Group Class (S2)", 2, "17:00", "Irene"],
  ["S2", "Reformer Group Class (S2)", 3, "17:00", "Irene"],
  ["S2", "Reformer Group Class (S2)", 4, "17:00", "Irene"],
  ["S2", "Reformer Group Class (S2)", 5, "17:00", "Irene"],
  ["S2", "Reformer Group Class (S2)", 1, "18:00", "Irene"],
  ["S2", "Reformer Group Class (S2)", 2, "18:00", "Irene"],
  ["S2", "Reformer Group Class (S2)", 3, "18:00", "Irene"],
  ["S2", "Reformer Group Class (S2)", 4, "18:00", "Irene"],
  ["S2", "Reformer Group Class (S2)", 5, "18:00", "Irene"],
  // ── S2 — Mat Pilates, 150 GHS ───────────────────────────────────────────
  ["S2", "Mat Pilates", 1, "09:30", "Amale"],
  ["S2", "Mat Pilates", 3, "09:30", "Amale"],
  ["S2", "Mat Pilates", 6, "09:30", "Irene"],
  // ── Airport — Reformer Group Class, 450 GHS (round-robin) ────────────────
  ["Airport", "Reformer Group Class", 4, "08:30", "Amale"],
  ["Airport", "Reformer Group Class", 6, "08:00", "Maryam"],
  ["Airport", "Reformer Group Class", 5, "10:30", "Grace"],
  ["Airport", "Reformer Group Class", 6, "10:30", "Irene"],
  ["Airport", "Reformer Group Class", 1, "11:30", "Amale"],
  ["Airport", "Reformer Group Class", 2, "11:00", "Maryam"],
  ["Airport", "Reformer Group Class", 3, "11:00", "Grace"],
  ["Airport", "Reformer Group Class", 4, "11:00", "Irene"],
  ["Airport", "Reformer Group Class", 5, "11:30", "Amale"],
  ["Airport", "Reformer Group Class", 2, "17:00", "Maryam"],
  ["Airport", "Reformer Group Class", 3, "17:30", "Grace"],
  ["Airport", "Reformer Group Class", 2, "18:00", "Irene"],
  ["Airport", "Reformer Group Class", 3, "18:30", "Amale"],
  ["Airport", "Reformer Group Class", 5, "18:00", "Maryam"],
  ["Airport", "Reformer Group Class", 1, "18:30", "Grace"], // Advanced
  ["Airport", "Reformer Group Class (Youmna)", 3, "14:00", "Youmna"],
  // ── Airport — Mat Pilates / Yin Yoga, 150 GHS ───────────────────────────
  ["Airport", "Mat Pilates", 1, "09:30", "Irene"],
  ["Airport", "Yin Yoga", 1, "10:30", "Irene"],
  // Tuesday's Mat Pilates slot is closed as of the September 2026 schedule.
  ["Airport", "Yin Yoga", 3, "09:30", "Irene"],
  ["Airport", "Mat Pilates", 4, "09:30", "Amale"],
  ["Airport", "Mat Pilates", 5, "09:30", "Maryam"],
  ["Airport", "Mat Pilates", 6, "09:30", "Grace"],
  // ── Cantonments — Reformer Group Class, 450 GHS (Adv → Albert) ───────────
  ["Cantonments", "Reformer Group Class", 2, "08:30", "Amale"],
  ["Cantonments", "Reformer Group Class", 1, "10:30", "Albert"], // Advanced
  ["Cantonments", "Reformer Group Class", 2, "10:30", "Amale"],
  ["Cantonments", "Reformer Group Class", 3, "10:30", "Amale"],
  ["Cantonments", "Reformer Group Class", 5, "10:30", "Albert"], // Advanced
  ["Cantonments", "Reformer Group Class", 1, "12:30", "Albert"], // Advanced
  ["Cantonments", "Reformer Group Class", 6, "11:30", "Albert"], // Advanced
  ["Cantonments", "Reformer Group Class", 6, "12:30", "Albert"], // Advanced
  ["Cantonments", "Reformer Group Class", 5, "13:00", "Amale"],
  ["Cantonments", "Reformer Group Class", 1, "17:00", "Amale"],
  ["Cantonments", "Reformer Group Class", 2, "17:00", "Amale"],
  ["Cantonments", "Reformer Group Class", 3, "17:00", "Amale"],
  ["Cantonments", "Reformer Group Class", 4, "17:00", "Amale"],
  ["Cantonments", "Reformer Group Class", 5, "17:30", "Amale"],
  ["Cantonments", "Reformer Group Class", 2, "18:00", "Amale"],
  ["Cantonments", "Reformer Group Class", 4, "18:00", "Amale"],
  // ── Cantonments — Mat Pilates, 150 GHS ─────────────────────────────────
  ["Cantonments", "Mat Pilates", 6, "10:30", "Maryam"],
  ["Cantonments", "Mat Pilates", 1, "18:00", "Amale"],
];

export interface AppliedSchedule {
  locationIds: Map<ScheduleLocation, string>;
  trainerIds: Map<string, string>;
  classTypeIds: Map<string, string>;
  rulesCreated: number;
  rulesWiped: number;
  sessionsWiped: number;
}

/**
 * Installs the weekly timetable: found-or-creates the locations, trainer
 * accounts and class types, wipes every existing RecurrenceRule (and future
 * booking-free sessions), and recreates the rules. Idempotent. The caller
 * runs generateSessions() afterwards to materialise sessions.
 */
export async function applySchedule(
  prisma: PrismaClient,
  opts: { trainerPassword?: string; validFrom?: Date; validUntil?: Date } = {},
): Promise<AppliedSchedule> {
  const passwordHash = await bcrypt.hash(opts.trainerPassword ?? "password123", 10);

  const locationIds = new Map<ScheduleLocation, string>();
  for (const name of SCHEDULE_LOCATIONS) {
    const details = SCHEDULE_LOCATION_DETAILS[name];
    const existing = await prisma.location.findFirst({ where: { name } });
    const loc = existing
      ? await prisma.location.update({ where: { id: existing.id }, data: { active: true, ...details } })
      : await prisma.location.create({ data: { name, ...details } });
    locationIds.set(name, loc.id);
  }
  // The schedule defines the studio's locations. Retire any others so the app's
  // location picker (and the "pick your studio" gate) isn't cluttered with
  // near-duplicates, and reset members who were pointed at a retired one.
  const keep = [...locationIds.values()];
  await prisma.location.updateMany({
    where: { id: { notIn: keep }, active: true },
    data: { active: false },
  });
  await prisma.member.updateMany({
    where: { preferredLocationId: { notIn: keep } },
    data: { preferredLocationId: null },
  });

  const trainerIds = new Map<string, string>();
  for (const t of SCHEDULE_TRAINERS) {
    const email = t.email.toLowerCase();
    let user = await prisma.user.findUnique({ where: { email }, include: { trainer: true } });
    if (!user) {
      user = await prisma.user.create({
        data: { name: t.key, email, phone: t.phone, passwordHash, role: "TRAINER" },
        include: { trainer: true },
      });
    }
    const trainer =
      user.trainer ??
      (await prisma.trainer.create({
        data: { userId: user.id, specialty: t.specialty, calendarColor: t.color, ptRateGHS: t.ptRateGHS },
      }));
    trainerIds.set(t.key, trainer.id);
  }

  const classTypeIds = new Map<string, string>();
  for (const c of SCHEDULE_CLASS_TYPES) {
    const existing = await prisma.classType.findFirst({ where: { name: c.name } });
    const ct = existing
      ? await prisma.classType.update({
          where: { id: existing.id },
          data: {
            priceGHS: c.priceGHS,
            durationMins: c.durationMins,
            defaultCapacity: c.defaultCapacity,
            description: c.description,
            active: true,
          },
        })
      : await prisma.classType.create({ data: { ...c } });
    classTypeIds.set(c.name, ct.id);
  }

  const todayMidnight = new Date();
  todayMidnight.setUTCHours(0, 0, 0, 0);
  const wipedSessions = await prisma.session.deleteMany({
    where: {
      recurrenceRuleId: { not: null },
      startsAt: { gte: todayMidnight },
      bookings: { none: {} },
    },
  });
  const wipedRules = await prisma.recurrenceRule.deleteMany({});

  const made = await prisma.recurrenceRule.createMany({
    data: SCHEDULE_RULES.map(([loc, className, dayOfWeek, time, trainer]) => ({
      dayOfWeek,
      time,
      classTypeId: classTypeIds.get(className)!,
      trainerId: trainerIds.get(trainer)!,
      locationId: locationIds.get(loc)!,
      validFrom: opts.validFrom ?? null,
      validUntil: opts.validUntil ?? null,
    })),
  });

  return {
    locationIds,
    trainerIds,
    classTypeIds,
    rulesCreated: made.count,
    rulesWiped: wipedRules.count,
    sessionsWiped: wipedSessions.count,
  };
}
