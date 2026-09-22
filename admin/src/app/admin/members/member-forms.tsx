"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseGHS } from "@backend/lib/money";

type PlanOpt = { id: string; name: string };

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

export function NewMemberButton({ plans }: { plans: PlanOpt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", planId: "", password: "" });

  async function submit() {
    setError(null);
    const err = await api("/api/members", "POST", {
      ...form,
      planId: form.planId || undefined,
    });
    if (err) setError(err);
    else {
      setOpen(false);
      setForm({ name: "", email: "", phone: "", planId: "", password: "" });
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white">
        + Member
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={() => setOpen(false)}>
      <div className="w-96 rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-stone-900">New member</h2>
        <div className="mt-4 space-y-3 text-sm">
          <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
          <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
          <input placeholder="Phone (+233…)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
          <select value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })} className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2">
            <option value="">No plan</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input type="password" placeholder="Password (8+ characters)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
          <p className="text-xs text-stone-400">Share this password with them; they change it in the app.</p>
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="rounded-lg border border-stone-300 px-4 py-2 text-sm">Cancel</button>
          <button onClick={submit} disabled={!form.name || !form.email || !form.phone || form.password.length < 8} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

export function MemberEditPanel(props: {
  memberId: string;
  current: { planId: string | null; status: string; creditsLeft: number };
  plans: PlanOpt[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [planId, setPlanId] = useState(props.current.planId ?? "");
  const [status, setStatus] = useState(props.current.status);
  const [credits, setCredits] = useState(String(props.current.creditsLeft));
  const [walletAdjust, setWalletAdjust] = useState("");

  async function save(body: Record<string, unknown>) {
    setError(null);
    setOk(false);
    const err = await api(`/api/members/${props.memberId}`, "PATCH", body);
    if (err) setError(err);
    else {
      setOk(true);
      setWalletAdjust("");
      router.refresh();
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-stone-700">Manage</h2>
      <div className="mt-3 space-y-3 text-sm">
        <label className="block">
          <span className="text-xs text-stone-500">Plan (changing resets credits)</span>
          <div className="mt-1 flex gap-2">
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2">
              <option value="">No plan</option>
              {props.plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button onClick={() => save({ planId: planId || null })} className="rounded-lg bg-stone-900 px-3 py-2 text-white">Apply</button>
          </div>
        </label>
        <label className="block">
          <span className="text-xs text-stone-500">Status</span>
          <div className="mt-1 flex gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2">
              {["ACTIVE", "FROZEN", "CANCELLED"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button onClick={() => save({ status })} className="rounded-lg bg-stone-900 px-3 py-2 text-white">Apply</button>
          </div>
        </label>
        <label className="block">
          <span className="text-xs text-stone-500">Credits</span>
          <div className="mt-1 flex gap-2">
            <input type="number" value={credits} onChange={(e) => setCredits(e.target.value)} className="flex-1 rounded-lg border border-stone-300 px-3 py-2" />
            <button onClick={() => save({ creditsLeft: Number(credits) })} className="rounded-lg bg-stone-900 px-3 py-2 text-white">Set</button>
          </div>
        </label>
        <label className="block">
          <span className="text-xs text-stone-500">Wallet adjustment (GHS, use - to deduct)</span>
          <div className="mt-1 flex gap-2">
            <input type="number" step="0.01" value={walletAdjust} onChange={(e) => setWalletAdjust(e.target.value)} placeholder="e.g. 50 or -20" className="flex-1 rounded-lg border border-stone-300 px-3 py-2" />
            <button
              onClick={() => {
                const v = Number(walletAdjust);
                if (!v) return;
                save({ walletAdjustGHS: v < 0 ? -parseGHS(String(-v)) : parseGHS(String(v)) });
              }}
              className="rounded-lg bg-stone-900 px-3 py-2 text-white"
            >
              Apply
            </button>
          </div>
        </label>
        {error && <p className="text-red-600">{error}</p>}
        {ok && <p className="text-emerald-600">Saved.</p>}
      </div>
    </div>
  );
}
