"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseGHS } from "@backend/lib/money";
import { fileToResizedDataUrl } from "@/lib/image";
import { AvailabilityPanel } from "../availability/availability-panel";
import { PtWindowsPanel } from "./pt-windows-panel";

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

export function NewTrainerButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", specialty: "", commission: "40", ptCommission: "60", ptRate: "", color: "#0ea5e9", password: "",
  });

  async function submit() {
    setError(null);
    const err = await api("/api/trainers", "POST", {
      name: form.name,
      email: form.email,
      phone: form.phone,
      specialty: form.specialty,
      commissionPercent: Number(form.commission),
      ptCommissionPercent: Number(form.ptCommission),
      ptRateGHS: form.ptRate ? parseGHS(form.ptRate) : 0,
      calendarColor: form.color,
      password: form.password,
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
        + Trainer
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={() => setOpen(false)}>
      <div className="w-96 rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-stone-900">New trainer</h2>
        <div className="mt-4 space-y-3 text-sm">
          <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
          <input placeholder="Specialty" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
          <div className="flex gap-2">
            <input type="number" placeholder="Commission %" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })} className="flex-1 rounded-lg border border-stone-300 px-3 py-2" />
            <input type="number" placeholder="PT commission %" value={form.ptCommission} onChange={(e) => setForm({ ...form, ptCommission: e.target.value })} className="flex-1 rounded-lg border border-stone-300 px-3 py-2" />
          </div>
          <div className="flex gap-2">
            <input type="number" placeholder="PT rate (GHS)" value={form.ptRate} onChange={(e) => setForm({ ...form, ptRate: e.target.value })} className="flex-1 rounded-lg border border-stone-300 px-3 py-2" />
            <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 w-10 rounded border border-stone-300" />
          </div>
          <input type="password" placeholder="Password (8+ characters)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-lg border border-stone-300 px-3 py-2" />
          <p className="text-xs text-stone-400">Share this password with them; they change it at /set-password.</p>
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="rounded-lg border border-stone-300 px-4 py-2 text-sm">Cancel</button>
          <button onClick={submit} disabled={!form.name || !form.email || !form.phone || form.password.length < 8} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Create</button>
        </div>
      </div>
    </div>
  );
}

export function TrainerRow({ trainer, locations }: {
  trainer: {
    id: string; name: string; email: string; phone: string; specialty: string;
    commissionPercent: number; ptCommissionPercent: number; ptRateGHS: number; calendarColor: string;
    photoUrl: string | null;
    sessions30: number; attended30: number; revenue30: string;
  };
  locations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [form, setForm] = useState({
    specialty: trainer.specialty,
    commission: String(trainer.commissionPercent),
    ptCommission: String(trainer.ptCommissionPercent),
    ptRate: String(trainer.ptRateGHS / 100),
    color: trainer.calendarColor,
  });

  async function save() {
    setError(null);
    const err = await api(`/api/trainers/${trainer.id}`, "PATCH", {
      specialty: form.specialty,
      commissionPercent: Number(form.commission),
      ptCommissionPercent: Number(form.ptCommission),
      ptRateGHS: parseGHS(form.ptRate || "0"),
      calendarColor: form.color,
      ...(photoDataUrl ? { photoDataUrl } : {}),
    });
    if (err) setError(err);
    else {
      setEditing(false);
      setPhotoDataUrl(null);
      router.refresh();
    }
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {photoDataUrl || trainer.photoUrl ? (
            <img
              src={photoDataUrl ?? trainer.photoUrl ?? undefined}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <span className="h-10 w-1.5 rounded-full" style={{ backgroundColor: trainer.calendarColor }} />
          )}
          <div>
            <p className="font-medium text-stone-900">{trainer.name}</p>
            <p className="text-xs text-stone-500">{trainer.email} · {trainer.phone}</p>
            <p className="text-xs text-stone-400">{trainer.specialty}</p>
          </div>
        </div>
        <div className="flex items-center gap-6 text-center text-xs text-stone-500">
          <div><p className="text-base font-semibold text-stone-900">{trainer.sessions30}</p>sessions 30d</div>
          <div><p className="text-base font-semibold text-stone-900">{trainer.attended30}</p>attended 30d</div>
          <div><p className="text-base font-semibold text-stone-900">{trainer.revenue30}</p>revenue 30d</div>
          <div><p className="text-base font-semibold text-stone-900">{trainer.commissionPercent}%</p>commission</div>
          <button onClick={() => setEditing(!editing)} className="rounded-lg border border-stone-300 px-3 py-1.5 text-stone-600">
            {editing ? "Close" : "Edit"}
          </button>
        </div>
      </div>
      {editing && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-4 text-sm">
          <input placeholder="Specialty" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} className="flex-1 rounded-lg border border-stone-300 px-3 py-2" />
          <label className="text-xs text-stone-500">Commission %
            <input type="number" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })} className="mt-1 w-28 rounded-lg border border-stone-300 px-3 py-2" />
          </label>
          <label className="text-xs text-stone-500">PT commission %
            <input type="number" value={form.ptCommission} onChange={(e) => setForm({ ...form, ptCommission: e.target.value })} className="mt-1 w-28 rounded-lg border border-stone-300 px-3 py-2" />
          </label>
          <label className="text-xs text-stone-500">PT rate GHS
            <input type="number" value={form.ptRate} onChange={(e) => setForm({ ...form, ptRate: e.target.value })} className="mt-1 w-28 rounded-lg border border-stone-300 px-3 py-2" />
          </label>
          <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 w-10 rounded border border-stone-300" />
          <label className="cursor-pointer rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-600 hover:bg-stone-50">
            {photoBusy ? "Processing…" : "Change photo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              disabled={photoBusy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setPhotoBusy(true);
                try {
                  setPhotoDataUrl(await fileToResizedDataUrl(file));
                } catch {
                  setError("Couldn't read that image — try a different file.");
                } finally {
                  setPhotoBusy(false);
                }
              }}
            />
          </label>
          <button onClick={save} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white">Save</button>
          {error && <p className="w-full text-red-600">{error}</p>}
          <div className="mt-4 w-full border-t border-stone-100 pt-4">
            <p className="mb-2 text-xs font-medium text-stone-500">Unavailability</p>
            <AvailabilityPanel trainerId={trainer.id} />
          </div>
          <div className="mt-4 w-full border-t border-stone-100 pt-4">
            <p className="mb-2 text-xs font-medium text-stone-500">Private class availability</p>
            <PtWindowsPanel trainerId={trainer.id} locations={locations} />
          </div>
        </div>
      )}
    </div>
  );
}
