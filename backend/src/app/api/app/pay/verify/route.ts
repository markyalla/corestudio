import { NextResponse } from "next/server";
import { apiHandler, requireMobileAuth } from "@/lib/rbac";
import { verifyTransaction } from "@/lib/paystack";
import { handleChargeSuccess } from "@/lib/payment-flows";

/** Callback-page verification. Also fulfils the charge if the webhook hasn't
 *  landed yet (idempotent with the webhook path). */
export const GET = apiHandler(async (req: Request) => {
  await requireMobileAuth(req, "ANY");
  const reference = new URL(req.url).searchParams.get("reference");
  if (!reference) return NextResponse.json({ error: "reference required" }, { status: 400 });

  const tx = await verifyTransaction(reference);
  if (tx.status === "success") {
    await handleChargeSuccess({
      reference: tx.reference,
      amount: tx.amount,
      channel: tx.channel,
      metadata: tx.metadata,
    });
    return NextResponse.json({ status: "success" });
  }
  return NextResponse.json({ status: tx.status });
});
