import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ApiError, apiHandler, requireRole } from "@/lib/rbac";

const schema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(20).optional(),
  position: z.enum(["SECURITY", "SECRETARY", "CLEANER", "OTHER"]).optional(),
  positionTitle: z.string().max(100).optional(),
  baseSalaryGHS: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export const PATCH = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["OWNER", "ADMIN", "ACCOUNTANT"]);
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());

    const existing = await prisma.staffMember.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Staff member not found");

    const staffMember = await prisma.$transaction(async (tx) => {
      const staffMember = await tx.staffMember.update({ where: { id }, data: body });
      await audit(tx, {
        userId: session.user.id,
        action: "staff_member.update",
        entity: "StaffMember",
        entityId: id,
        payload: body,
      });
      return staffMember;
    });

    return NextResponse.json({ staffMember });
  },
);
