"use client";

import { useCallback, useEffect, useState } from "react";
import { formatGHS, parseGHS } from "@backend/lib/money";

type Window = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  locationId: string;
  locationName: string;
  durationMins: number;
  title: string;
  priceGHS: number;
  active: boolean;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function api(path: string, method: string, body?: unknown): Promise<{ error?: string }> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { error: data.error ?? `Request failed (${res.status})` };
  }
  return {};
}

const inp = "rounded-lg border border-stone-300 px-2 py-1 text-xs";

/** Trainer's recurring availability for private (one-on-one) classes. Members
 *  book their own start time inside one of these windows in the app. */
export function PtWindowsPanel({
  trainerId,
  locations,
}: {
  trainerId: string;
  locations: { id: string; name: string }[];
}) {
  const [windows, setWindows] = useState<Window[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    dayOfWeek: "1",
    startTime: "13:00",
    endTime: "17:00",
    locationId: locations[0]?.id ?? "",
    durationMins: "60",
    price: "",
    title: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/trainers/${trainerId}/pt-windows`);
    if (res.ok) setWindows((await res.json()).windows);
    setLoading(false);
  }, [trainerId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() sets loading before its first await
    load();
  }, [load]);

  async function add() {
    setError(null);
    const res = await api(`/api/trainers/${trainerId}/pt-windows`, "POST", {
      dayOfWeek: Number(form.dayOfWeek),
      startTime: form.startTime,
      endTime: form.endTime,
      locationId: form.locationId,
      durationMins: Number(form.durationMins),
      title: form.title,
      ...(form.price ? { priceGHS: parseGHS(form.price) } : {}),
    });
    if (res.error) return setError(res.error);
    setForm({ ...form, title: "", price: "" });
    await load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    const res = await api(`/api/trainers/${trainerId}/pt-windows`, "PATCH", { id, ...body });
    if (res.error) return setError(res.error);
    await load();
  }

  return (
    <div>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      {loading ? (
        <p className="text-xs text-stone-400">Loading…</p>
      ) : windows.length === 0 ? (
        <p className="text-xs text-stone-400">No private-class windows yet.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <tbody>
            {windows.map((w) => (
              <tr key={w.id} className="border-t border-stone-100">
                <td className="py-1.5 font-medium text-stone-700">{DAYS[w.dayOfWeek]}</td>
                <td className="py-1.5 text-stone-600">{w.startTime}–{w.endTime}</td>
                <td className="py-1.5 text-stone-600">{w.locationName}</td>
                <td className="py-1.5 text-stone-500">{w.durationMins}m</td>
                <td className="py-1.5 text-stone-600">{formatGHS(w.priceGHS)}</td>
                <td className="py-1.5 text-stone-500">{w.title}</td>
                <td className="py-1.5 text-right">
                  <button
                    onClick={() => patch(w.id, { active: !w.active })}
                    className={`rounded-full px-2 py-0.5 ${w.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
                  >
                    {w.active ? "Active" : "Off"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
        <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })} className={`bg-white ${inp}`}>
          {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
        <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className={inp} />
        <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className={inp} />
        <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} className={`bg-white ${inp}`}>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <input type="number" placeholder="Mins" value={form.durationMins} onChange={(e) => setForm({ ...form, durationMins: e.target.value })} className={`w-16 ${inp}`} />
        <input type="number" placeholder="Price GHS" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={`w-24 ${inp}`} />
        <input placeholder="Title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inp} />
        <button
          onClick={add}
          disabled={!form.locationId}
          className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Add window
        </button>
      </div>
      <p className="mt-2 text-[11px] text-stone-400">
        Price defaults to the trainer&apos;s PT rate. Members pick their own start time inside the window.
      </p>
    </div>
  );
}
