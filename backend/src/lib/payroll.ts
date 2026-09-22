import { prisma } from "./prisma";
import { audit } from "./audit";
import { ApiError } from "./errors";

function currentMonthRange(): { periodStart: Date; periodEnd: Date } {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { periodStart, periodEnd };
}

export type StaffOwed = {
  staffMemberId: string;
  name: string;
  position: string;
  positionTitle: string;
  baseSalaryGHS: number;
  periodStart: Date;
  periodEnd: Date;
};

/** Active staff members not yet paid for the current calendar month. */
export async function computeStaffOwed(): Promise<StaffOwed[]> {
  const { periodStart, periodEnd } = currentMonthRange();
  const staff = await prisma.staffMember.findMany({
    where: {
      active: true,
      payrollPayments: { none: { periodStart, periodEnd } },
    },
    orderBy: { name: "asc" },
  });
  return staff.map((s) => ({
    staffMemberId: s.id,
    name: s.name,
    position: s.position,
    positionTitle: s.positionTitle,
    baseSalaryGHS: s.baseSalaryGHS,
    periodStart,
    periodEnd,
  }));
}

/** Creates this month's PayrollPayment for a staff member, withholding social security at the studio's current rate. */
export async function createPayrollPayment(opts: { staffMemberId: string; actorUserId: string }) {
  return prisma.$transaction(async (tx) => {
    const staffMember = await tx.staffMember.findUnique({ where: { id: opts.staffMemberId } });
    if (!staffMember) throw new ApiError(404, "Staff member not found");
    if (!staffMember.active) throw new ApiError(400, "Staff member is not active");

    const { periodStart, periodEnd } = currentMonthRange();
    const existing = await tx.payrollPayment.findUnique({
      where: { staffMemberId_periodStart_periodEnd: { staffMemberId: staffMember.id, periodStart, periodEnd } },
    });
    if (existing) throw new ApiError(400, "Already paid for this period");

    const studio = await tx.studio.findFirstOrThrow();
    const socialSecurityGHS = Math.floor(
      (staffMember.baseSalaryGHS * studio.socialSecurityPercent) / 100,
    );
    const netGHS = staffMember.baseSalaryGHS - socialSecurityGHS;

    const payment = await tx.payrollPayment.create({
      data: {
        staffMemberId: staffMember.id,
        periodStart,
        periodEnd,
        baseSalaryGHS: staffMember.baseSalaryGHS,
        socialSecurityPercent: studio.socialSecurityPercent,
        socialSecurityGHS,
        netGHS,
        status: "PENDING",
      },
    });
    await audit(tx, {
      userId: opts.actorUserId,
      action: "payroll.create",
      entity: "PayrollPayment",
      entityId: payment.id,
      payload: { staffMemberId: staffMember.id, baseSalaryGHS: staffMember.baseSalaryGHS, socialSecurityGHS, netGHS },
    });
    return payment;
  });
}

/** Marks a payroll payment PAID with the manual MoMo transfer reference. */
export async function markPayrollPaid(opts: {
  payrollPaymentId: string;
  reference: string;
  actorUserId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payrollPayment.findUnique({ where: { id: opts.payrollPaymentId } });
    if (!payment) throw new ApiError(404, "Payroll payment not found");
    if (payment.status === "PAID") throw new ApiError(400, "Already paid");

    const updated = await tx.payrollPayment.update({
      where: { id: payment.id },
      data: { status: "PAID", paidAt: new Date(), reference: opts.reference },
    });
    await audit(tx, {
      userId: opts.actorUserId,
      action: "payroll.mark_paid",
      entity: "PayrollPayment",
      entityId: payment.id,
      payload: { reference: opts.reference },
    });
    return updated;
  });
}
