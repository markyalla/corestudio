"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PayoutActions({ trainerId, amount }: { trainerId: string; amount: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    if (!confirm(`Create a payout of ${amount} for this trainer? This locks in the included bookings.`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trainerId }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed");
      return;
    }
    router.refresh();
  }

  return (
    <span>
      <button
        onClick={pay}
        disabled={busy}
        className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {busy ? "…" : "Pay"}
      </button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function MarkPaidButton({ payoutId }: { payoutId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markPaid() {
    const reference = prompt("MoMo transfer reference:");
    if (!reference) return;
    setBusy(true);
    const res = await fetch(`/api/payouts/${payoutId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "MARK_PAID", reference }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Failed");
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={markPaid}
      disabled={busy}
      className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
    >
      {busy ? "…" : "Mark paid"}
    </button>
  );
}
