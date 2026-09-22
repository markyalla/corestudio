// Clan 7's private-session services and one-time session bundles, from the
// "CLAN 7 - UPDATE" pricing PDF. All one-on-one (kind PT, capacity 1) — no
// weekly recurring schedule here (unlike schedule.ts's group classes);
// admin/owner assigns trainers and times per session directly.

import type { PrismaClient } from "@prisma/client";

// trainerKey matches SCHEDULE_TRAINERS' `key` (== that trainer's User.name)
// in schedule.ts — set only where the PDF names exactly one trainer, so the
// admin "New session" modal can auto-pick them. Left unset for Physiotherapy
// (Darlene | Albert | Ramiro) and Thai Massage (no trainer named on the PDF)
// since those are genuinely multi-trainer/unassigned — admin still chooses.
export const CLAN7_CLASS_TYPES = [
  { name: "Physiotherapy", priceGHS: 80000, durationMins: 60, description: "Helps clients with injuries and the management of neurological, neuromusculoskeletal, cardiovascular and respiratory conditions. With Darlene, Albert or Ramiro." },
  { name: "Thai Massage (60 min)", priceGHS: 80000, durationMins: 60, description: "Deep tissue, oil, relaxation — practitioners use a variety of techniques to relieve tension, promote relaxation, improve flexibility and enhance circulation." },
  { name: "Thai Massage (90 min)", priceGHS: 90000, durationMins: 90, description: "Deep tissue, oil, relaxation — practitioners use a variety of techniques to relieve tension, promote relaxation, improve flexibility and enhance circulation." },
  { name: "Thai Massage (120 min)", priceGHS: 117000, durationMins: 120, description: "Deep tissue, oil, relaxation — practitioners use a variety of techniques to relieve tension, promote relaxation, improve flexibility and enhance circulation." },
  { name: "Myofascial Therapy (Ramiro)", priceGHS: 80000, durationMins: 60, description: "Releases tightness or pain through myofascial tissue manipulation and vibrations.", trainerKey: "Ramiro" },
  { name: "Musculoskeletal Therapy (Ramiro)", priceGHS: 80000, durationMins: 60, description: "Treatment of musculoskeletal, sports related, orthopedic, neurological and medical conditions using dry needling, manual therapy and rehabilitation techniques.", trainerKey: "Ramiro" },
  { name: "Cupping (Ramiro)", priceGHS: 80000, durationMins: 60, description: "Uses the force of suction to pull blood toward the skin's surface to enhance the body's natural healing response in targeted areas.", trainerKey: "Ramiro" },
  { name: "Musculoskeletal & Sports Physiotherapy (Ramiro)", priceGHS: 80000, durationMins: 60, description: "Treatment of musculoskeletal, sports related, orthopedic, neurological and medical conditions using dry needling, manual therapy and rehabilitation techniques.", trainerKey: "Ramiro" },
  { name: "Pilates (Maryam)", priceGHS: 105000, durationMins: 60, description: "A one-on-one only experience at Clan 7. Pilates Equipment and props are used for rehab, to promote flexibility, muscle tone and strength. With Maryam.", trainerKey: "Maryam" },
  { name: "Pilates (Darlene)", priceGHS: 90000, durationMins: 60, description: "A one-on-one only experience at Clan 7. Pilates Equipment and props are used for rehab, to promote flexibility, muscle tone and strength. With Darlene.", trainerKey: "Darlene" },
  { name: "Physio Pilates (Darlene)", priceGHS: 90000, durationMins: 60, description: "Led by a physiotherapist, this practice combines the strengths of physiotherapy and Pilates to provide a rehab experience to treat injuries, relieve tension and strengthen key muscles. With Darlene.", trainerKey: "Darlene" },
] as const;

// Package pricing follows the studio's stated formula: pay for the paid
// count at the service's per-session rate, get the rest free. 3-month
// expiry ≈ 90 days, 5-month ≈ 150 days.
const THREE_MONTHS_DAYS = 90;
const FIVE_MONTHS_DAYS = 150;

export const CLAN7_PACKAGES = [
  // Thai Massage — buy 7 get 1 free (8 sessions, 3mo) / buy 12 get 2 free (14 sessions, 5mo), per duration tier.
  { name: "Thai Massage 60min — Buy 7 Get 1", classType: "Thai Massage (60 min)", sessionsGranted: 8, priceGHS: 7 * 80000, validDays: THREE_MONTHS_DAYS },
  { name: "Thai Massage 60min — Buy 12 Get 2", classType: "Thai Massage (60 min)", sessionsGranted: 14, priceGHS: 12 * 80000, validDays: FIVE_MONTHS_DAYS },
  { name: "Thai Massage 90min — Buy 7 Get 1", classType: "Thai Massage (90 min)", sessionsGranted: 8, priceGHS: 7 * 90000, validDays: THREE_MONTHS_DAYS },
  { name: "Thai Massage 90min — Buy 12 Get 2", classType: "Thai Massage (90 min)", sessionsGranted: 14, priceGHS: 12 * 90000, validDays: FIVE_MONTHS_DAYS },
  { name: "Thai Massage 120min — Buy 7 Get 1", classType: "Thai Massage (120 min)", sessionsGranted: 8, priceGHS: 7 * 117000, validDays: THREE_MONTHS_DAYS },
  { name: "Thai Massage 120min — Buy 12 Get 2", classType: "Thai Massage (120 min)", sessionsGranted: 14, priceGHS: 12 * 117000, validDays: FIVE_MONTHS_DAYS },
  // Pilates — monthly bundle, trainer-locked via the classType itself.
  { name: "Pilates (Maryam) — 5 Sessions", classType: "Pilates (Maryam)", sessionsGranted: 5, priceGHS: 420000, validDays: 30 },
  { name: "Pilates (Darlene) — 5 Sessions", classType: "Pilates (Darlene)", sessionsGranted: 5, priceGHS: 360000, validDays: 30 },
] as const;

export interface AppliedClan7 {
  classTypeIds: Map<string, string>;
  packagesCreated: number;
  packagesUpdated: number;
}

/** Idempotent: class types and packages are found-or-created by name, then
 *  their price/duration/description kept in sync with the definitions above.
 *  Trainer keys resolve against Trainer.user.name — same "key == name"
 *  convention schedule.ts's applySchedule() sets up, so this only finds
 *  trainers that installer has already created. */
export async function applyClan7(prisma: PrismaClient): Promise<AppliedClan7> {
  const classTypeIds = new Map<string, string>();
  for (const c of CLAN7_CLASS_TYPES) {
    const { trainerKey, ...fields } = c as typeof c & { trainerKey?: string };
    const defaultTrainerId = trainerKey
      ? (await prisma.trainer.findFirst({ where: { user: { name: trainerKey } } }))?.id ?? null
      : null;

    const existing = await prisma.classType.findFirst({ where: { name: c.name } });
    const ct = existing
      ? await prisma.classType.update({
          where: { id: existing.id },
          data: { priceGHS: fields.priceGHS, durationMins: fields.durationMins, defaultCapacity: 1, description: fields.description, active: true, defaultTrainerId },
        })
      : await prisma.classType.create({ data: { ...fields, defaultCapacity: 1, defaultTrainerId } });
    classTypeIds.set(c.name, ct.id);
  }

  let packagesCreated = 0;
  let packagesUpdated = 0;
  for (const p of CLAN7_PACKAGES) {
    const classTypeId = classTypeIds.get(p.classType)!;
    const existing = await prisma.package.findFirst({ where: { name: p.name } });
    if (existing) {
      await prisma.package.update({
        where: { id: existing.id },
        data: { classTypeId, sessionsGranted: p.sessionsGranted, priceGHS: p.priceGHS, validDays: p.validDays, active: true },
      });
      packagesUpdated++;
    } else {
      await prisma.package.create({
        data: { name: p.name, classTypeId, sessionsGranted: p.sessionsGranted, priceGHS: p.priceGHS, validDays: p.validDays },
      });
      packagesCreated++;
    }
  }

  return { classTypeIds, packagesCreated, packagesUpdated };
}
