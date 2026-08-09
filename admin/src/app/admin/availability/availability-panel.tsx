"use client";

import { useEffect, useState } from "react";

async function api(path: string, method: string, body?: unknown): Promise<{ error?: string; data?: unknown }> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error ?? `Request failed (${res.status})` };
  return { data };
}

const DAYS_AHEAD = 42; // 6 weeks

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Shared "mark unavailable dates" widget — used both by a trainer managing
 *  their own calendar and by OWNER/ADMIN managing any trainer's from the
 *  Trainers page. Hard-block enforcement itself lives server-side; this is
 *  just the UI to set/clear the dates it checks against. */
export function AvailabilityPanel({ trainerId }: { trainerId: string }) {
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const [range, setRange] = useState({ start: "", end: "" });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => new Date(today.getTime() + i * 86400000));

  async function load() {
    setLoading(true);
    const from = isoDate(today);
    const to = isoDate(days[days.length - 1]);
    const res = await api(`/api/trainers/${trainerId}/unavailability?from=${from}&to=${to}`, "GET");
    if (res.data) {
      const rows = (res.data as { dates: { date: string }[] }).dates;
      setMarked(new Set(rows.map((r) => r.date.slice(0, 10))));
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; load() sets loading state before its first await
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainerId]);

  async function toggleDay(day: Date) {
    setError(null);
    setConflictMsg(null);
    const iso = isoDate(day);
    if (marked.has(iso)) {
      const res = await api(`/api/trainers/${trainerId}/unavailability`, "DELETE", { dates: [iso] });
      if (res.error) return setError(res.error);
    } else {
      const res = await api(`/api/trainers/${trainerId}/unavailability`, "POST", { dates: [iso] });
      if (res.error) return setError(res.error);
      const conflicts = (res.data as { conflicts: { id: string }[] }).conflicts;
      if (conflicts.length > 0) {
        setConflictMsg(`${conflicts.length} session(s) already scheduled on this date — cancel or reassign them from the Timetable.`);
      }
    }
    await load();
  }

  async function blockRange() {
    if (!range.start || !range.end) return;
    setError(null);
    setConflictMsg(null);
    const res = await api(`/api/trainers/${trainerId}/unavailability`, "POST", {
      startDate: range.start,
      endDate: range.end,
    });
    if (res.error) return setError(res.error);
    const conflicts = (res.data as { conflicts: { id: string }[] }).conflicts;
    if (conflicts.length > 0) {
      setConflictMsg(`${conflicts.length} session(s) already scheduled in this range — cancel or reassign them from the Timetable.`);
    }
    setRange({ start: "", end: "" });
    await load();
  }

  return (
    <div>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      {conflictMsg && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{conflictMsg}</p>
      )}
      {loading ? (
        <p className="text-xs text-stone-400">Loading…</p>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const iso = isoDate(d);
            const isMarked = marked.has(iso);
            return (
              <button
                key={iso}
                onClick={() => toggleDay(d)}
                title={iso}
                className={`rounded px-1 py-1.5 text-[11px] ${
                  isMarked ? "bg-red-100 text-red-700" : "bg-stone-50 text-stone-600 hover:bg-stone-100"
                }`}
              >
                {d.toISOString().slice(5, 10)}
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-stone-500">Block a range:</span>
        <input
          type="date"
          value={range.start}
          onChange={(e) => setRange({ ...range, start: e.target.value })}
          className="rounded-lg border border-stone-300 px-2 py-1"
        />
        <input
          type="date"
          value={range.end}
          onChange={(e) => setRange({ ...range, end: e.target.value })}
          className="rounded-lg border border-stone-300 px-2 py-1"
        />
        <button
          onClick={blockRange}
          disabled={!range.start || !range.end}
          className="rounded-lg bg-stone-900 px-3 py-1.5 text-white disabled:opacity-50"
        >
          Block range
        </button>
      </div>
      <p className="mt-2 text-[11px] text-stone-400">Red = marked unavailable. Click a day to toggle it.</p>
    </div>
  );
}
