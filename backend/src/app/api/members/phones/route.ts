import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, requireRole } from "@/lib/rbac";

/** Just the member phone numbers (no names) — the owner pastes these into a
 *  WhatsApp broadcast list / status to send announcements & promos.
 *  ?audience=all|active  (default all) */
export const GET = apiHandler(async (req: Request) => {
  await requireRole(["OWNER"]);
  const audience = new URL(req.url).searchParams.get("audience");

  const members = await prisma.member.findMany({
    where: {
      ...(audience === "active" ? { status: "ACTIVE" } : {}),
      user: { phone: { not: null } },
    },
    select: { user: { select: { phone: true } } },
  });

  const phones = [
    ...new Set(members.map((m) => (m.user.phone ?? "").trim()).filter(Boolean)),
  ].sort();

  return NextResponse.json({ count: phones.length, phones, joined: phones.join("\n") });
});
