import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler, requireRole } from "@/lib/rbac";

const schema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(20).default(""),
  position: z.enum(["SECURITY", "SECRETARY", "CLEANER", "OTHER"]),
  positionTitle: z.string().max(100).default(""),
  baseSalaryGHS: z.number().int().min(0),
});

/** Accountant (or owner/admin) adds a non-login staff member — security,
 *  secretary, cleaner, other — for payroll purposes only. */
export const POST = apiHandler(async (req: Request) => {
  const session = await requireRole(["OWNER", "ADMIN", "ACCOUNTANT"]);
  const body = schema.parse(await req.json());

  const staffMember = await prisma.$transaction(async (tx) => {
    const staffMember = await tx.staffMember.create({
      data: { ...body, createdByUserId: session.user.id },
    });
    await audit(tx, {
      userId: session.user.id,
      action: "staff_member.create",
      entity: "StaffMember",
      entityId: staffMember.id,
      payload: { name: body.name, position: body.position, baseSalaryGHS: body.baseSalaryGHS },
    });
    return staffMember;
  });

  return NextResponse.json({ staffMember }, { status: 201 });
});
