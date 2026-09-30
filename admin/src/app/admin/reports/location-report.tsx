"use client";

import { useState } from "react";
import { formatGHS } from "@backend/lib/money";

export interface LocationReportMember {
  name: string;
  status: string;
}

export interface LocationReportClass {
  key: string;
  className: string;
  trainerName: string;
  bookedCount: number;
  attendedCount: number;
  noShowCount: number;
  revenueGHS: number;
  members: LocationReportMember[];
}

export interface LocationReportGroup {
  locationId: string;
  locationName: string;
  classes: LocationReportClass[];
}

function statusPill(status: string): string {
  if (status === "ATTENDED") return "bg-emerald-50 text-emerald-700";
  if (status === "NO_SHOW") return "bg-red-50 text-red-600";
  return "bg-stone-100 text-stone-500";
}

/** Per-location breakdown of every class (with its trainer), who booked it,
 *  who attended, and the revenue it brought in — member lists stay collapsed
 *  per class/trainer row until asked for, since a busy studio's full roster
 *  would otherwise make this page unreadable. */
export function LocationReport({ locations }: { locations: LocationReportGroup[] }) {
  if (locations.length === 0) {
    return (
      <div className="mt-6 rounded-2xl bg-white p-6 text-sm text-stone-400 shadow-sm">
        No bookings in the last 30 days.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {locations.map((loc) => (
        <div key={loc.locationId} className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-sm font-medium text-stone-700">{loc.locationName}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-stone-400">
                <tr>
                  <th className="py-1.5 whitespace-nowrap">Class</th>
                  <th className="py-1.5 whitespace-nowrap">Trainer</th>
                  <th className="py-1.5 text-right whitespace-nowrap">Booked</th>
                  <th className="py-1.5 text-right whitespace-nowrap">Attended</th>
                  <th className="py-1.5 text-right whitespace-nowrap">Revenue</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {loc.classes.map((c) => (
                  <ClassRow key={c.key} group={c} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function ClassRow({ group }: { group: LocationReportClass }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-t border-stone-100">
        <td className="py-2 whitespace-nowrap text-stone-800">{group.className}</td>
        <td className="py-2 whitespace-nowrap text-stone-600">{group.trainerName}</td>
        <td className="py-2 text-right whitespace-nowrap text-stone-600">{group.bookedCount}</td>
        <td className="py-2 text-right whitespace-nowrap text-stone-600">{group.attendedCount}</td>
        <td className="py-2 text-right whitespace-nowrap font-medium text-stone-900">{formatGHS(group.revenueGHS)}</td>
        <td className="py-2 text-right whitespace-nowrap">
          <button onClick={() => setOpen(!open)} className="text-xs text-stone-500 underline underline-offset-2 hover:text-stone-800">
            {open ? "Hide" : `Members (${group.members.length})`}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-stone-50 bg-stone-50">
          <td colSpan={6} className="px-2 py-3">
            <ul className="space-y-1.5 text-xs">
              {group.members.map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="text-stone-700">{m.name}</span>
                  <span className={`rounded-full px-2 py-0.5 whitespace-nowrap ${statusPill(m.status)}`}>{m.status}</span>
                </li>
              ))}
              {group.members.length === 0 && <li className="text-stone-400">No bookings.</li>}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
