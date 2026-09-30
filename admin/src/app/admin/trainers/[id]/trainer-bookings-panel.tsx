"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@backend/lib/money";

export interface TrainerBookingRow {
  id: string;
  status: string;
  paidWith: string | null;
  amountGHS: number;
  memberName: string;
  className: string;
  locationName: string | null;
  startsAt: string;
}

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

function statusPill(status: string): string {
  if (status === "ATTENDED") return "bg-emerald-50 text-emerald-700";
  if (status === "NO_SHOW") return "bg-red-50 text-red-600";
  if (status === "WAITLIST") return "bg-amber-50 text-amber-700";
  return "bg-sky-50 text-sky-700"; // BOOKED
}

/** Every member who's booked this trainer's classes, most recent first —
 *  the same check-in / cancel actions the calendar's session roster offers,
 *  but as one flat list across all of a trainer's sessions instead of one
 *  session at a time. */
export function TrainerBookingsPanel({ bookings }: { bookings: TrainerBookingRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: "CHECK_IN" | "NO_SHOW" | "CANCEL") {
    setBusyId(id);
    setError(null);
    const err = await api(`/api/bookings/${id}`, "PATCH", { action });
    if (err) setError(err);
    else router.refresh();
    setBusyId(null);
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-stone-700">Members who booked</h2>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-stone-400">
            <tr>
              <th className="py-1.5 whitespace-nowrap">Member</th>
              <th className="py-1.5 whitespace-nowrap">Class</th>
              <th className="py-1.5 whitespace-nowrap">When</th>
              <th className="py-1.5 whitespace-nowrap">Status</th>
              <th className="py-1.5 whitespace-nowrap">Paid</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-t border-stone-100">
                <td className="py-2 whitespace-nowrap text-stone-800">{b.memberName}</td>
                <td className="py-2 whitespace-nowrap text-stone-600">
                  {b.className}
                  {b.locationName && <span className="text-stone-400"> · {b.locationName}</span>}
                </td>
                <td className="py-2 whitespace-nowrap text-stone-500">
                  {b.startsAt.slice(0, 16).replace("T", " ")}
                </td>
                <td className="py-2 whitespace-nowrap">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${statusPill(b.status)}`}>{b.status}</span>
                </td>
                <td className="py-2 whitespace-nowrap text-stone-500">
                  {b.paidWith ?? "—"}{b.amountGHS > 0 && ` · ${formatGHS(b.amountGHS)}`}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {(b.status === "BOOKED" || b.status === "WAITLIST") && (
                    <div className="flex justify-end gap-1">
                      {b.status === "BOOKED" && (
                        <button
                          disabled={busyId === b.id}
                          onClick={() => act(b.id, "CHECK_IN")}
                          className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                        >
                          ✓ Attended
                        </button>
                      )}
                      <button
                        disabled={busyId === b.id}
                        onClick={() => act(b.id, "CANCEL")}
                        className="rounded bg-stone-200 px-2 py-1 text-xs text-stone-700 disabled:opacity-50"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {bookings.length === 0 && (
              <tr><td colSpan={6} className="py-4 text-stone-400">No bookings yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
