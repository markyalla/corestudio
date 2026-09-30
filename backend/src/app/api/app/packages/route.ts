import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, requireMobileAuth } from "@/lib/rbac";

/** Packages a member can self-serve purchase from the app, plus their own
 *  active (unexpired, sessions remaining) packages. Each package can cover
 *  more than one ClassType, sharing one pool of sessions across all of them. */
export const GET = apiHandler(async (req: Request) => {
  const auth = await requireMobileAuth(req, ["MEMBER"]);
  const member = await prisma.member.findFirst({ where: { userId: auth.user.id } });

  const [packages, mine] = await Promise.all([
    prisma.package.findMany({
      where: { active: true },
      orderBy: { priceGHS: "asc" },
      include: {
        classTypes: { select: { id: true, name: true, description: true } },
        perks: { where: { active: true }, select: { name: true } },
      },
    }),
    member
      ? prisma.memberPackage.findMany({
          where: { memberId: member.id, sessionsLeft: { gt: 0 }, expiresAt: { gt: new Date() } },
          include: {
            package: {
              include: {
                classTypes: { select: { id: true, name: true, description: true } },
                perks: { where: { active: true }, select: { name: true } },
              },
            },
          },
          orderBy: { expiresAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    packages: packages.map((p) => ({
      id: p.id,
      name: p.name,
      classes: p.classTypes.map((c) => ({ id: c.id, name: c.name, description: c.description })),
      sessionsGranted: p.sessionsGranted,
      priceGHS: p.priceGHS,
      validDays: p.validDays,
      perks: p.perks.map((perk) => perk.name),
    })),
    myPackages: mine.map((mp) => ({
      id: mp.id,
      name: mp.package.name,
      classes: mp.package.classTypes.map((c) => ({ id: c.id, name: c.name, description: c.description })),
      sessionsLeft: mp.sessionsLeft,
      expiresAt: mp.expiresAt,
      perks: mp.package.perks.map((perk) => perk.name),
    })),
  });
});
