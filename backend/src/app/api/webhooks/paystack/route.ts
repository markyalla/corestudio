import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/paystack";
import { handleChargeSuccess } from "@/lib/payment-flows";

/** Paystack webhook. Signature-verified (HMAC-SHA512) and idempotent. */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  if (event.event === "charge.success") {
    const d = event.data;
    await handleChargeSuccess({
      reference: d.reference,
      amount: d.amount,
      channel: d.channel,
      metadata: d.metadata ?? null,
    });
  }
  // Acknowledge everything else so Paystack stops retrying
  return NextResponse.json({ received: true });
}
