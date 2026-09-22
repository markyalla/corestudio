import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";
import { createSessionSchema } from "@/lib/validation";
import { assertNoTrainerSessionOverlap, assertTrainerAvailable } from "@/lib/availability";
import { generateSessions } from "@/lib/cron-jobs";

/** Create a session; with recurring=true also creates a weekly RecurrenceRule
 *  and immediately materialises the full booking window for that slot. */
export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const body = createSessionSchema.parse(await req.json());

  if (body.kind === "CLASS" && !body.classTypeId) {
    return NextResponse.json({ error: "classTypeId required for CLASS" }, { status: 400 });
  }

  // A recurring class is scoped to the calendar month of its start date — the
  // studio builds a fresh timetable each month.
  const isRecurringClass = body.recurring && body.kind === "CLASS" && !!body.classTypeId;
  const validFrom = isRecurringClass
    ? new Date(Date.UTC(body.startsAt.getUTCFullYear(), body.startsAt.getUTCMonth(), 1))
    : null;
  const validUntil = isRecurringClass
    ? new Date(Date.UTC(body.startsAt.getUTCFullYear(), body.startsAt.getUTCMonth() + 1, 1))
    : null;

  let dates: Date[] = [body.startsAt];
  if (body.recurring) {
    for (let week = 1; week <= 3; week++) {
      dates.push(new Date(body.startsAt.getTime() + week * 7 * 24 * 60 * 60 * 1000));
    }
    if (validUntil) dates = dates.filter((d) => d < validUntil);
  }

  const created = await prisma.$transaction(async (tx) => {
    await assertTrainerAvailable(tx, body.trainerId, dates);
    for (const startsAt of dates) {
      await assertNoTrainerSessionOverlap(tx, body.trainerId, startsAt, body.durationMins);
    }

    let recurrenceRuleId: string | undefined;

    if (isRecurringClass && body.classTypeId) {
      const hh = String(body.startsAt.getUTCHours()).padStart(2, "0");
      const mm = String(body.startsAt.getUTCMinutes()).padStart(2, "0");
      const rule = await tx.recurrenceRule.create({
        data: {
          dayOfWeek: body.startsAt.getUTCDay(),
          time: `${hh}:${mm}`,
          classTypeId: body.classTypeId,
          trainerId: body.trainerId,
          locationId: body.locationId,
          capacity: body.capacity,
          validFrom,
          validUntil,
        },
      });
      recurrenceRuleId = rule.id;
    }

    const sessions = [];
    for (const startsAt of dates) {
      sessions.push(
        await tx.session.create({
          data: {
            kind: body.kind,
            classTypeId: body.classTypeId ?? null,
            trainerId: body.trainerId,
            locationId: body.locationId,
            startsAt,
            durationMins: body.durationMins,
            capacity: body.capacity,
            priceGHS: body.priceGHS,
            recurrenceRuleId,
          },
        }),
      );
    }

    await audit(tx, {
      userId: session.user.id,
      action: body.recurring ? "session.create_recurring" : "session.create",
      entity: "Session",
      entityId: sessions[0].id,
      payload: { count: sessions.length, recurrenceRuleId },
    });
    return sessions;
  });

  // Fill the rest of the booking window for the new rule now, so every added
  // class shows on the members' timetable straight away (not only after the
  // next cron run). Runs after the txn commits so the rule is visible to it.
  if (isRecurringClass) {
    await generateSessions();
  }

  return NextResponse.json({ sessions: created }, { status: 201 });
});
