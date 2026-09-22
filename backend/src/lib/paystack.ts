import crypto from "crypto";
import { ApiError } from "./errors";

const BASE = "https://api.paystack.co";

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new ApiError(502, "Payments are not configured");
  return key;
}

export type ChargeMetadata =
  | { kind: "BOOKING"; sessionId: string; memberId: string; walletApplied: number }
  | { kind: "RENEWAL"; memberId: string; planId: string; walletApplied: number }
  | { kind: "WAITLIST_CLAIM"; bookingId: string }
  | { kind: "PACKAGE"; memberId: string; packageId: string };

/** Starts a Paystack checkout (card + all Ghanaian mobile money). Amount in pesewas. */
export async function initializeTransaction(opts: {
  email: string;
  amountPesewas: number;
  reference: string;
  metadata: ChargeMetadata;
  callbackUrl: string;
  // Shown as read-only fields on Paystack's checkout page and recorded on
  // the dashboard's transaction record, so staff reconciling payments there
  // see who paid, not just their email.
  customerName?: string;
  customerPhone?: string;
}) {
  const customFields = [
    opts.customerName ? { display_name: "Name", variable_name: "name", value: opts.customerName } : null,
    opts.customerPhone ? { display_name: "Phone", variable_name: "phone", value: opts.customerPhone } : null,
  ].filter((f): f is { display_name: string; variable_name: string; value: string } => f !== null);

  const res = await fetch(`${BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: opts.email,
      amount: opts.amountPesewas,
      currency: "GHS",
      reference: opts.reference,
      channels: ["card", "mobile_money"],
      metadata: { ...opts.metadata, custom_fields: customFields },
      callback_url: opts.callbackUrl,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.status) {
    console.error(`Paystack initialize failed: ${data.message ?? res.status}`);
    throw new ApiError(502, "Payment couldn't be started — try again shortly");
  }
  return data.data as { authorization_url: string; access_code: string; reference: string };
}

export async function verifyTransaction(reference: string) {
  const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });
  const data = await res.json();
  if (!res.ok || !data.status) {
    console.error(`Paystack verify failed: ${data.message ?? res.status}`);
    throw new ApiError(502, "Couldn't confirm payment status — try again shortly");
  }
  return data.data as {
    status: string;
    reference: string;
    amount: number;
    channel: string;
    metadata: ChargeMetadata | null;
  };
}

/** Webhook authenticity: HMAC-SHA512 of the raw body with the secret key. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha512", secretKey()).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Paystack channel → our PaymentMethod. */
export function channelToMethod(channel: string): "CARD" | "MOMO" {
  return channel === "card" ? "CARD" : "MOMO";
}

export function newReference(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}
