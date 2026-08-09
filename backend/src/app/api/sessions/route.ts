import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";
import { createSessionSchema } from "@/lib/validation";
import { assertTrainerAvailable } from "@/lib/availability";

/** Create a session; with recurring=true also creates a weekly RecurrenceRule
 *  and generates sessions 4 weeks ahead for that slot. */
export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN"]);
  const body = createSessionSchema.parse(await req.json());

  if (body.kind === "CLASS" && !body.classTypeId) {
    return NextResponse.json({ error: "classTypeId required for CLASS" }, { status: 400 });
  }

  const dates: Date[] = [body.startsAt];
  if (body.recurring) {
    for (let week = 1; week <= 3; week++) {
      dates.push(new Date(body.startsAt.getTime() + week * 7 * 24 * 60 * 60 * 1000));
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    await assertTrainerAvailable(tx, body.trainerId, dates);

    let recurrenceRuleId: string | undefined;

    if (body.recurring && body.kind === "CLASS" && body.classTypeId) {
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

  return NextResponse.json({ sessions: created }, { status: 201 });
});
