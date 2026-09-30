import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ApiError, apiHandler, requireRole } from "@/lib/rbac";
import { updateMemberSchema } from "@/lib/validation";

export const PATCH = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["OWNER", "ADMIN"]);
    const { id } = await ctx.params;
    const body = updateMemberSchema.parse(await req.json());

    const updated = await prisma.$transaction(async (tx) => {
      const member = await tx.member.findUnique({ where: { id }, include: { user: true } });
      if (!member) throw new ApiError(404, "Member not found");

      if (body.name || body.phone) {
        await tx.user.update({
          where: { id: member.userId },
          data: {
            ...(body.name ? { name: body.name } : {}),
            ...(body.phone ? { phone: body.phone } : {}),
          },
        });
      }

      const result = await tx.member.update({
        where: { id },
        data: {
          ...(body.status ? { status: body.status } : {}),
          ...(body.walletAdjustGHS
            ? { walletGHS: { increment: body.walletAdjustGHS } }
            : {}),
        },
      });

      await audit(tx, {
        userId: session.user.id,
        action: "member.update",
        entity: "Member",
        entityId: id,
        payload: JSON.parse(JSON.stringify(body)),
      });
      return result;
    });

    return NextResponse.json({ member: updated });
  },
);
