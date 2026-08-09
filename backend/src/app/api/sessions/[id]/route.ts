import { NextResponse } from "next/server";
import { apiHandler, requireRole } from "@/lib/rbac";
import { updateSessionSchema } from "@/lib/validation";
import { cancelSession } from "@/lib/booking";

export const PATCH = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["OWNER", "ADMIN"]);
    const { id } = await ctx.params;
    const body = updateSessionSchema.parse(await req.json());

    if (body.action === "CANCEL") {
      await cancelSession({ sessionId: id, actorUserId: session.user.id });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  },
);
