import { prisma } from "@/lib/prisma";
import { ApiError, apiHandler, requireRole } from "@/lib/rbac";
import { formatGHS } from "@/lib/money";
import { buildPdf, type PdfLine } from "@/lib/pdf";

/** Payout statement PDF. Staff, or the trainer the payout belongs to. */
export const GET = apiHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["OWNER", "ADMIN", "ACCOUNTANT", "TRAINER"]);
    const { id } = await ctx.params;

    const payout = await prisma.payout.findUnique({
      where: { id },
      include: {
        trainer: { include: { user: true } },
        lines: {
          include: {
            booking: {
              include: {
                member: { include: { user: true } },
                session: { include: { classType: true } },
              },
            },
          },
        },
      },
    });
    if (!payout) throw new ApiError(404, "Payout not found");
    if (
      session.user.role === "TRAINER" &&
      payout.trainer.userId !== session.user.id
    ) {
      throw new ApiError(403, "Not your payout");
    }

    const studio = await prisma.studio.findFirstOrThrow();
    const fmtD = (d: Date) => d.toISOString().slice(0, 10);

    const lines: PdfLine[] = [
      { text: studio.name, size: 18, bold: true },
      { text: "Trainer payout statement", size: 11 },
      { text: "" },
      { text: `Trainer: ${payout.trainer.user.name}`, bold: true },
      { text: `Period: ${fmtD(payout.periodStart)} to ${fmtD(payout.periodEnd)}` },
      { text: `Status: ${payout.status}${payout.paidAt ? ` on ${fmtD(payout.paidAt)}` : ""}` },
      ...(payout.reference ? [{ text: `Transfer reference: ${payout.reference}` }] : []),
      { text: "" },
      { text: "Sessions included", size: 12, bold: true },
      { text: "" },
    ];

    for (const line of payout.lines) {
      const b = line.booking;
      lines.push({
        text: `${b.session.startsAt.toISOString().slice(0, 16).replace("T", " ")}  ${
          (b.session.classType?.name ?? "Private class").padEnd(20)
        }  ${b.member.user.name.padEnd(22)}  ${formatGHS(b.amountGHS)}`,
        size: 9,
        indent: 6,
      });
    }

    lines.push(
      { text: "" },
      { text: `Gross bookings: ${formatGHS(payout.grossGHS)}`, indent: 6 },
    );
    if (payout.ptGrossGHS > 0) {
      lines.push(
        { text: `  of which group: ${formatGHS(payout.grossGHS - payout.ptGrossGHS)} @ ${payout.commissionPercent}%`, indent: 6 },
        { text: `  of which private: ${formatGHS(payout.ptGrossGHS)} @ ${payout.ptCommissionPercent}%`, indent: 6 },
      );
    } else {
      lines.push({ text: `Commission: ${payout.commissionPercent}%`, indent: 6 });
    }
    lines.push(
      { text: "" },
      { text: `Amount due: ${formatGHS(payout.amountGHS)}`, size: 14, bold: true },
    );

    const pdf = buildPdf(lines);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="payout-${payout.trainer.user.name.replace(/\s+/g, "-")}-${fmtD(payout.periodEnd)}.pdf"`,
      },
    });
  },
);
