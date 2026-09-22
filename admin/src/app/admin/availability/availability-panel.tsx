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

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Mon=0 .. Sun=6, matching WEEKDAYS above (JS getUTCDay() is Sun=0..Sat=6). */
function mondayIndex(d: Date) {
  return (d.getUTCDay() + 6) % 7;
}

/** Shared "mark unavailable dates" widget — used both by a trainer managing
 *  their own calendar and by OWNER/ADMIN managing any trainer's from the
 *  Trainers page. Defaults to next month, so admins can plan who to assign
 *  classes to before that month's timetable is built. Hard-block enforcement
 *  itself lives server-side; this is just the UI to set/clear the dates it
 *  checks against. */
export function AvailabilityPanel({ trainerId }: { trainerId: string }) {
  // 0 = current month, 1 = next month (default), 2 = the month after, etc.
  const [monthOffset, setMonthOffset] = useState(1);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const [range, setRange] = useState({ start: "", end: "" });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1));
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
  const daysInMonth = monthEnd.getUTCDate();
  const leadingBlanks = mondayIndex(monthStart);
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), i + 1))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  async function load() {
    setLoading(true);
    const res = await api(
      `/api/trainers/${trainerId}/unavailability?from=${isoDate(monthStart)}&to=${isoDate(monthEnd)}`,
      "GET",
    );
    if (res.data) {
      const rows = (res.data as { dates: { date: string }[] }).dates;
      setMarked(new Set(rows.map((r) => r.date.slice(0, 10))));
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount/month-change; load() sets loading state before its first await
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainerId, monthOffset]);

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

      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setMonthOffset((m) => Math.max(0, m - 1))}
          disabled={monthOffset === 0}
          className="rounded-lg border border-stone-300 px-2 py-1 text-xs disabled:opacity-30"
        >
          ←
        </button>
        <p className="text-xs font-medium text-stone-700">
          {MONTH_NAMES[monthStart.getUTCMonth()]} {monthStart.getUTCFullYear()}
          {monthOffset === 1 && <span className="ml-1 text-stone-400">(next month)</span>}
        </p>
        <button
          onClick={() => setMonthOffset((m) => m + 1)}
          className="rounded-lg border border-stone-300 px-2 py-1 text-xs"
        >
          →
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-stone-400">Loading…</p>
      ) : (
        <div>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <p key={w} className="text-center text-[10px] font-medium text-stone-400">{w}</p>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={`blank-${i}`} />;
              const iso = isoDate(d);
              const isMarked = marked.has(iso);
              const isPast = d.getTime() < today.getTime();
              return (
                <button
                  key={iso}
                  onClick={() => toggleDay(d)}
                  disabled={isPast}
                  title={iso}
                  className={`rounded px-1 py-1.5 text-[11px] ${
                    isPast
                      ? "cursor-not-allowed bg-stone-50 text-stone-300"
                      : isMarked
                        ? "bg-red-100 text-red-700"
                        : "bg-stone-50 text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {d.getUTCDate()}
                </button>
              );
            })}
          </div>
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
