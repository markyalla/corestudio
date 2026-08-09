import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@backend/lib/prisma";
import { startWaitlistClaimCheckout } from "@backend/lib/payment-flows";

export const dynamic = "force-dynamic";

/** SMS payment link target for a promoted waitlist spot — straight to Paystack. */
export default async function WaitlistPayPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const session = await auth();
  const { bookingId } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { member: { include: { user: true } } },
  });
  if (!booking || booking.member.userId !== session!.user.id) {
    return <main className="p-6 text-sm text-stone-500">Booking not found.</main>;
  }

  try {
    const { authorizationUrl } = await startWaitlistClaimCheckout({
      bookingId,
      userEmail: booking.member.user.email,
      userName: booking.member.user.name,
      userPhone: booking.member.user.phone,
    });
    redirect(authorizationUrl);
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    return (
      <main className="flex min-h-[70vh] items-center justify-center p-6">
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-stone-600 shadow-sm">
          {(e as Error).message}
        </div>
      </main>
    );
  }
}
