import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, requireMobileAuth } from "@/lib/rbac";

/** Plans a member can self-serve subscribe to from the app. */
export const GET = apiHandler(async (req: Request) => {
  await requireMobileAuth(req, ["MEMBER"]);
  const plans = await prisma.membershipPlan.findMany({
    where: { active: true },
    orderBy: { priceGHS: "asc" },
    include: { perks: { where: { active: true } } },
  });

  return NextResponse.json({
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      priceGHS: p.priceGHS,
      classesPerCycle: p.classesPerCycle,
      bonusCredits: p.bonusCredits,
      cycleDays: p.cycleDays,
      description: p.description,
      perks: p.perks.map((perk) => perk.name),
    })),
  });
});
