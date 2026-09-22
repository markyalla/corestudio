"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseGHS } from "@backend/lib/money";

async function api(path: string, method: string, body: unknown): Promise<string | null> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return data.error ?? `Request failed (${res.status})`;
  }
  return null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonthISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export function NewSocialSecurityButton({ suggestedAmountGHS }: { suggestedAmountGHS: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    periodStart: firstOfMonthISO(),
    periodEnd: todayISO(),
    amount: String(suggestedAmountGHS / 100),
  });

  async function submit() {
    setError(null);
    const err = await api("/api/social-security", "POST", {
      periodStart: form.periodStart,
      periodEnd: form.periodEnd,
      amountGHS: parseGHS(form.amount || "0"),
    });
    if (err) setError(err);
    else {
      setOpen(false);
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white">
        + Remittance
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={() => setOpen(false)}>
      <div className="w-96 rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-stone-900">Log social security remittance</h2>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex gap-2">
            <label className="flex-1 text-xs text-stone-500">From
              <input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" />
            </label>
            <label className="flex-1 text-xs text-stone-500">To
              <input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" />
            </label>
          </div>
          <input type="number" placeholder="Amount (GHS)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="rounded-lg border border-stone-300 px-4 py-2 text-sm">Cancel</button>
          <button onClick={submit} disabled={!form.amount} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Log</button>
        </div>
      </div>
    </div>
  );
}

export function MarkSocialSecurityPaidButton({ remittanceId }: { remittanceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markPaid() {
    const reference = prompt("Transfer reference:");
    if (!reference) return;
    setBusy(true);
    const err = await api(`/api/social-security/${remittanceId}`, "PATCH", { action: "MARK_PAID", reference });
    setBusy(false);
    if (err) {
      alert(err);
      return;
    }
    router.refresh();
  }

  return (
    <button onClick={markPaid} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
      {busy ? "…" : "Mark paid"}
    </button>
  );
}

export function NewTaxPaymentButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: "",
    periodStart: firstOfMonthISO(),
    periodEnd: todayISO(),
    amount: "",
  });

  async function submit() {
    setError(null);
    const err = await api("/api/tax-payments", "POST", {
      type: form.type,
      periodStart: form.periodStart,
      periodEnd: form.periodEnd,
      amountGHS: parseGHS(form.amount || "0"),
    });
    if (err) setError(err);
    else {
      setOpen(false);
      setForm({ type: "", periodStart: firstOfMonthISO(), periodEnd: todayISO(), amount: "" });
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white">
        + Tax payment
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={() => setOpen(false)}>
      <div className="w-96 rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-stone-900">Log tax payment</h2>
        <div className="mt-4 space-y-3 text-sm">
          <input placeholder="Type (e.g. VAT, Income tax)" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
          <div className="flex gap-2">
            <label className="flex-1 text-xs text-stone-500">From
              <input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" />
            </label>
            <label className="flex-1 text-xs text-stone-500">To
              <input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" />
            </label>
          </div>
          <input type="number" placeholder="Amount (GHS)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="rounded-lg border border-stone-300 px-4 py-2 text-sm">Cancel</button>
          <button onClick={submit} disabled={!form.type || !form.amount} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Log</button>
        </div>
      </div>
    </div>
  );
}

export function MarkTaxPaymentPaidButton({ taxPaymentId }: { taxPaymentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markPaid() {
    const reference = prompt("Transfer reference:");
    if (!reference) return;
    setBusy(true);
    const err = await api(`/api/tax-payments/${taxPaymentId}`, "PATCH", { action: "MARK_PAID", reference });
    setBusy(false);
    if (err) {
      alert(err);
      return;
    }
    router.refresh();
  }

  return (
    <button onClick={markPaid} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
      {busy ? "…" : "Mark paid"}
    </button>
  );
}
