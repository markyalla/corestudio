import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, requireMobileAuth } from "@/lib/rbac";

/** Help-desk contact info for the "Contact us" section of the app: the
 *  studio's shared email/WhatsApp, plus each active location's front-desk
 *  phone number and address. */
export const GET = apiHandler(async (req: Request) => {
  await requireMobileAuth(req, ["MEMBER"]);
  const [studio, locations] = await Promise.all([
    prisma.studio.findFirstOrThrow(),
    prisma.location.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({
    contactEmail: studio.contactEmail,
    whatsapp: studio.whatsapp,
    locations: locations.map((l) => ({ id: l.id, name: l.name, address: l.address, phone: l.phone })),
  });
});
