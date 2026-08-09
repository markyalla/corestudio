"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConfirmCashButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/payments/${paymentId}/confirm-cash`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to confirm");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={confirm}
        disabled={busy}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {busy ? "Confirming…" : "Confirm cash received"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
