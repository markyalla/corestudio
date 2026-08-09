"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseGHS } from "@backend/lib/money";

export function RecordPaymentButton({ members }: { members: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ memberId: "", amount: "", description: "", method: "CASH" });

  async function submit() {
    setError(null);
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: form.memberId,
        amountGHS: parseGHS(form.amount),
        method: form.method,
        description: form.description,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to record payment");
      return;
    }
    setOpen(false);
    setForm({ memberId: "", amount: "", description: "", method: "CASH" });
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white">
        + Record payment
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={() => setOpen(false)}>
      <div className="w-96 rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-stone-900">Record manual payment</h2>
        <div className="mt-4 space-y-3 text-sm">
          <select value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2">
            <option value="">Select member…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <div className="flex gap-2">
            <input type="number" step="0.01" placeholder="Amount (GHS)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="flex-1 rounded-lg border border-stone-300 px-3 py-2" />
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="w-28 rounded-lg border border-stone-300 bg-white px-3 py-2">
              {["CASH", "MOMO", "CARD"].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <input placeholder="Description (e.g. Core 8 renewal)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="rounded-lg border border-stone-300 px-4 py-2 text-sm">Cancel</button>
          <button onClick={submit} disabled={!form.memberId || !form.amount} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Record
          </button>
        </div>
      </div>
    </div>
  );
}
