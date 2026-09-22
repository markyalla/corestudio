import { verifyTransaction } from "@/lib/paystack";
import { handleChargeSuccess } from "@/lib/payment-flows";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

function html(body: string) {
  return new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:system-ui;padding:2rem;text-align:center;color:#292524">${body}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/**
 * Paystack redirects the mobile in-app browser here after checkout. The RN
 * app opens checkout with this URL as its WebBrowser redirect target, so it
 * auto-closes on navigation here — this page's own content is just a fallback
 * for whenever the browser doesn't auto-close. Fulfillment itself is
 * idempotent and also happens via the webhook / GET /api/app/pay/verify.
 */
export async function GET(req: Request) {
  const reference = new URL(req.url).searchParams.get("reference");
  if (!reference) return html("Missing payment reference.");

  // No bearer token is possible here — Paystack redirects the bare browser,
  // not the app — so this endpoint is necessarily unauthenticated. Guard it
  // with a per-IP cap instead, since it otherwise lets anyone burn calls
  // against Paystack's verify API with arbitrary guessed reference strings.
  if (!checkRateLimit(`pay-callback:${clientIp(req)}`, { max: 20, windowMs: 5 * 60 * 1000 })) {
    return html("Too many requests — try again in a few minutes.");
  }

  try {
    const tx = await verifyTransaction(reference);
    if (tx.status === "success") {
      await handleChargeSuccess({
        reference: tx.reference,
        amount: tx.amount,
        channel: tx.channel,
        metadata: tx.metadata,
      });
      return html("Payment received — you can return to the CoreStudio app.");
    }
    return html(`Payment ${tx.status}. You can return to the CoreStudio app.`);
  } catch {
    return html("Couldn't confirm payment yet — check the app in a moment.");
  }
}
