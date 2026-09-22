"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseGHS, formatGHS } from "@backend/lib/money";

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

const POSITIONS = [
  { value: "SECURITY", label: "Security" },
  { value: "SECRETARY", label: "Secretary" },
  { value: "CLEANER", label: "Cleaner" },
  { value: "OTHER", label: "Other" },
];

export function NewStaffMemberButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", position: "SECURITY", positionTitle: "", baseSalary: "" });

  async function submit() {
    setError(null);
    const err = await api("/api/staff-members", "POST", {
      name: form.name,
      phone: form.phone,
      position: form.position,
      positionTitle: form.position === "OTHER" ? form.positionTitle : "",
      baseSalaryGHS: parseGHS(form.baseSalary || "0"),
    });
    if (err) setError(err);
    else {
      setOpen(false);
      setForm({ name: "", phone: "", position: "SECURITY", positionTitle: "", baseSalary: "" });
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white">
        + Staff
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={() => setOpen(false)}>
      <div className="w-96 rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-stone-900">New staff</h2>
        <div className="mt-4 space-y-3 text-sm">
          <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
          <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2">
            {POSITIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {form.position === "OTHER" && (
            <input placeholder="Position title (e.g. Handyman)" value={form.positionTitle} onChange={(e) => setForm({ ...form, positionTitle: e.target.value })} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
          )}
          <input type="number" placeholder="Base salary (GHS/month)" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="rounded-lg border border-stone-300 px-4 py-2 text-sm">Cancel</button>
          <button onClick={submit} disabled={!form.name || !form.baseSalary} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Create</button>
        </div>
      </div>
    </div>
  );
}

export function StaffMemberRow({ staffMember, positionLabel, owedThisMonth }: {
  staffMember: {
    id: string; name: string; phone: string; position: string; positionTitle: string;
    baseSalaryGHS: number; active: boolean;
  };
  positionLabel: string;
  owedThisMonth: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ baseSalary: String(staffMember.baseSalaryGHS / 100) });

  async function save() {
    setError(null);
    const err = await api(`/api/staff-members/${staffMember.id}`, "PATCH", {
      baseSalaryGHS: parseGHS(form.baseSalary || "0"),
    });
    if (err) setError(err);
    else {
      setEditing(false);
      router.refresh();
    }
  }

  async function toggleActive() {
    const err = await api(`/api/staff-members/${staffMember.id}`, "PATCH", { active: !staffMember.active });
    if (!err) router.refresh();
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-stone-900">{staffMember.name}</p>
          <p className="text-xs text-stone-500">{staffMember.phone || "—"} · {positionLabel}{staffMember.positionTitle ? ` (${staffMember.positionTitle})` : ""}</p>
        </div>
        <div className="flex items-center gap-3 text-center text-xs text-stone-500">
          <div><p className="text-base font-semibold text-stone-900">{formatGHS(staffMember.baseSalaryGHS)}</p>base salary</div>
          <span className={`rounded-full px-2 py-0.5 ${owedThisMonth ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
            {owedThisMonth ? "Unpaid this month" : "Paid this month"}
          </span>
          <button
            onClick={toggleActive}
            className={`rounded-full px-3 py-1 ${staffMember.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
          >
            {staffMember.active ? "Active" : "Inactive"}
          </button>
          <button onClick={() => setEditing(!editing)} className="rounded-lg border border-stone-300 px-3 py-1.5 text-stone-600">
            {editing ? "Close" : "Edit"}
          </button>
        </div>
      </div>
      {editing && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-4 text-sm">
          <label className="text-xs text-stone-500">Base salary GHS
            <input type="number" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} className="mt-1 w-32 rounded-lg border border-stone-300 px-3 py-2" />
          </label>
          <button onClick={save} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white">Save</button>
          {error && <p className="w-full text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

export function PayAction({ staffMemberId, amount }: { staffMemberId: string; amount: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    if (!confirm(`Pay ${amount} to this staff member for this month?`)) return;
    setBusy(true);
    setError(null);
    const err = await api("/api/payroll", "POST", { staffMemberId });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    router.refresh();
  }

  return (
    <span>
      <button onClick={pay} disabled={busy} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
        {busy ? "…" : "Pay"}
      </button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function MarkPayrollPaidButton({ payrollPaymentId }: { payrollPaymentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markPaid() {
    const reference = prompt("MoMo transfer reference:");
    if (!reference) return;
    setBusy(true);
    const err = await api(`/api/payroll/${payrollPaymentId}`, "PATCH", { action: "MARK_PAID", reference });
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
