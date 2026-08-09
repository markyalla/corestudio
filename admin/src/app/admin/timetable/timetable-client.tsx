"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS, parseGHS } from "@backend/lib/money";

type BookingRow = {
  id: string;
  status: string;
  paidWith: string | null;
  amountGHS: number;
  member: { id: string; user: { name: string } };
};
type SessionRow = {
  id: string;
  kind: string;
  startsAt: string;
  durationMins: number;
  capacity: number;
  priceGHS: number;
  status: string;
  classType: { name: string } | null;
  trainer: { calendarColor: string; user: { name: string } };
  location: { name: string } | null;
  bookings: BookingRow[];
};
type ClassTypeRow = {
  id: string;
  name: string;
  durationMins: number;
  priceGHS: number;
  defaultCapacity: number;
};
type TrainerOpt = { id: string; name: string; color: string; ptRateGHS: number };
type MemberOpt = { id: string; name: string; creditsLeft: number; status: string };
type LocationOpt = { id: string; name: string };
type UnavailabilityRow = { trainerId: string; date: string };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function hhmm(iso: string) {
  return new Date(iso).toISOString().slice(11, 16);
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

export function TimetableClient(props: {
  weekStart: string;
  weekOffset: number;
  isTrainer: boolean;
  sessions: SessionRow[];
  classTypes: ClassTypeRow[];
  trainers: TrainerOpt[];
  members: MemberOpt[];
  locations: LocationOpt[];
  unavailability: UnavailabilityRow[];
}) {
  const router = useRouter();
  const [openSession, setOpenSession] = useState<SessionRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekStart = new Date(props.weekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
    return { date: d, sessions: props.sessions.filter((s) => new Date(s.startsAt).toISOString().slice(0, 10) === d.toISOString().slice(0, 10)) };
  });

  async function run(action: () => Promise<string | null>) {
    setError(null);
    const err = await action();
    if (err) setError(err);
    else {
      setOpenSession(null);
      setShowCreate(false);
      router.refresh();
    }
  }

  return (
    <main className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">Timetable</h1>
        <div className="flex items-center gap-2">
          <a href={`?week=${props.weekOffset - 1}`} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm">←</a>
          <span className="text-sm text-stone-600">
            Week of {weekStart.toISOString().slice(0, 10)}
          </span>
          <a href={`?week=${props.weekOffset + 1}`} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm">→</a>
          {!props.isTrainer && (
            <button
              onClick={() => setShowCreate(true)}
              className="ml-3 rounded-lg bg-stone-900 px-4 py-1.5 text-sm font-medium text-white"
            >
              + Session
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 grid grid-cols-7 gap-2">
        {days.map((day, i) => (
          <div key={i} className="min-h-[60vh] rounded-xl bg-white p-2 shadow-sm">
            <p className="mb-2 text-center text-xs font-medium text-stone-500">
              {DAYS[i]} {day.date.toISOString().slice(8, 10)}
            </p>
            <div className="space-y-1.5">
              {day.sessions.map((s) => {
                const booked = s.bookings.filter((b) => ["BOOKED", "ATTENDED"].includes(b.status)).length;
                const wait = s.bookings.filter((b) => b.status === "WAITLIST").length;
                return (
                  <button
                    key={s.id}
                    onClick={() => setOpenSession(s)}
                    className={`w-full rounded-lg border-l-4 px-2 py-1.5 text-left text-xs ${
                      s.status === "CANCELLED" ? "bg-stone-100 opacity-50" : "bg-stone-50 hover:bg-stone-100"
                    }`}
                    style={{ borderLeftColor: s.trainer.calendarColor }}
                  >
                    <p className="font-semibold text-stone-800">
                      {hhmm(s.startsAt)} {s.classType?.name ?? "PT"}
                      {s.status === "CANCELLED" && " (cancelled)"}
                    </p>
                    <p className="text-stone-500">
                      {s.trainer.user.name}
                      {s.location && ` · ${s.location.name}`}
                    </p>
                    <p className="text-stone-400">
                      {booked}/{s.capacity}
                      {wait > 0 && ` +${wait} WL`}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {openSession && (
        <RosterDrawer
          session={openSession}
          members={props.members}
          isTrainer={props.isTrainer}
          onClose={() => setOpenSession(null)}
          onAction={run}
        />
      )}
      {showCreate && (
        <CreateSessionModal
          classTypes={props.classTypes}
          trainers={props.trainers}
          locations={props.locations}
          unavailability={props.unavailability}
          onClose={() => setShowCreate(false)}
          onAction={run}
        />
      )}
    </main>
  );
}

function RosterDrawer(props: {
  session: SessionRow;
  members: MemberOpt[];
  isTrainer: boolean;
  onClose: () => void;
  onAction: (a: () => Promise<string | null>) => void;
}) {
  const s = props.session;
  const [memberQuery, setMemberQuery] = useState("");
  const [paidWith, setPaidWith] = useState("CREDIT");
  const active = s.bookings.filter((b) => b.status !== "CANCELLED");
  const matches = memberQuery
    ? props.members.filter((m) => m.name.toLowerCase().includes(memberQuery.toLowerCase())).slice(0, 5)
    : [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={props.onClose}>
      <div className="h-full w-96 overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">{s.classType?.name ?? "PT session"}</h2>
            <p className="text-sm text-stone-500">
              {new Date(s.startsAt).toISOString().slice(0, 16).replace("T", " ")} · {s.trainer.user.name} ·{" "}
              {formatGHS(s.priceGHS)}
              {s.location && ` · ${s.location.name}`}
            </p>
          </div>
          <button onClick={props.onClose} className="text-stone-400 hover:text-stone-600">✕</button>
        </div>

        <h3 className="mt-5 text-sm font-medium text-stone-700">
          Roster ({active.filter((b) => ["BOOKED", "ATTENDED"].includes(b.status)).length}/{s.capacity})
        </h3>
        <ul className="mt-2 space-y-2">
          {active.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
              <div>
                <p className="text-stone-800">{b.member.user.name}</p>
                <p className="text-xs text-stone-400">
                  {b.status} · {b.paidWith ?? "—"}
                  {b.amountGHS > 0 && ` · ${formatGHS(b.amountGHS)}`}
                </p>
              </div>
              <div className="flex gap-1">
                {b.status === "BOOKED" && (
                  <>
                    <button
                      title="Check in"
                      onClick={() => props.onAction(() => api(`/api/bookings/${b.id}`, "PATCH", { action: "CHECK_IN" }))}
                      className="rounded bg-emerald-600 px-2 py-1 text-xs text-white"
                    >
                      ✓ In
                    </button>
                    <button
                      title="Cancel booking"
                      onClick={() => props.onAction(() => api(`/api/bookings/${b.id}`, "PATCH", { action: "CANCEL" }))}
                      className="rounded bg-stone-200 px-2 py-1 text-xs text-stone-700"
                    >
                      ✕
                    </button>
                  </>
                )}
                {b.status === "WAITLIST" && (
                  <button
                    title="Cancel waitlist entry"
                    onClick={() => props.onAction(() => api(`/api/bookings/${b.id}`, "PATCH", { action: "CANCEL" }))}
                    className="rounded bg-stone-200 px-2 py-1 text-xs text-stone-700"
                  >
                    ✕
                  </button>
                )}
              </div>
            </li>
          ))}
          {active.length === 0 && <p className="text-sm text-stone-400">No bookings yet.</p>}
        </ul>

        {!props.isTrainer && s.status === "SCHEDULED" && (
          <>
            <h3 className="mt-6 text-sm font-medium text-stone-700">Front-desk booking</h3>
            <input
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder="Search member…"
              className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            <select
              value={paidWith}
              onChange={(e) => setPaidWith(e.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="CREDIT">Plan credit</option>
              <option value="CASH">Cash</option>
              <option value="MOMO">MoMo (manual)</option>
              <option value="CARD">Card (manual)</option>
              <option value="COMP">Comp (free)</option>
            </select>
            <ul className="mt-2 space-y-1">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() =>
                      props.onAction(() =>
                        api("/api/bookings", "POST", { sessionId: s.id, memberId: m.id, paidWith }),
                      )
                    }
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-left text-sm hover:bg-stone-50"
                  >
                    {m.name}
                    <span className="ml-2 text-xs text-stone-400">
                      {m.status} · {m.creditsLeft} classes left
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <button
              onClick={() => {
                if (confirm("Cancel this session? All members will be refunded and notified.")) {
                  props.onAction(() => api(`/api/sessions/${s.id}`, "PATCH", { action: "CANCEL" }));
                }
              }}
              className="mt-8 w-full rounded-lg border border-red-200 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Cancel session
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CreateSessionModal(props: {
  classTypes: ClassTypeRow[];
  trainers: TrainerOpt[];
  locations: LocationOpt[];
  unavailability: UnavailabilityRow[];
  onClose: () => void;
  onAction: (a: () => Promise<string | null>) => void;
}) {
  const [kind, setKind] = useState("CLASS");
  const [classTypeId, setClassTypeId] = useState(props.classTypes[0]?.id ?? "");
  const [trainerId, setTrainerId] = useState(props.trainers[0]?.id ?? "");
  const [locationId, setLocationId] = useState(props.locations[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("17:30");
  const [capacity, setCapacity] = useState("");
  const [price, setPrice] = useState("");
  const [recurring, setRecurring] = useState(false);

  const ct = props.classTypes.find((c) => c.id === classTypeId);
  const tr = props.trainers.find((t) => t.id === trainerId);
  const isBlocked = date
    ? props.unavailability.some((u) => u.trainerId === trainerId && u.date === date)
    : false;

  function submit() {
    const startsAt = `${date}T${time}:00.000Z`; // Africa/Accra == UTC
    const body = {
      kind,
      classTypeId: kind === "CLASS" ? classTypeId : undefined,
      trainerId,
      locationId,
      startsAt,
      durationMins: kind === "CLASS" ? (ct?.durationMins ?? 60) : 60,
      capacity: capacity ? Number(capacity) : kind === "CLASS" ? (ct?.defaultCapacity ?? 8) : 1,
      priceGHS: price ? parseGHS(price) : kind === "CLASS" ? (ct?.priceGHS ?? 0) : (tr?.ptRateGHS ?? 0),
      recurring: kind === "CLASS" ? recurring : false,
    };
    props.onAction(() => api("/api/sessions", "POST", body));
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={props.onClose}>
      <div className="w-96 rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-stone-900">New session</h2>
        <div className="mt-4 space-y-3 text-sm">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2">
            <option value="CLASS">Class</option>
            <option value="PT">Personal training</option>
          </select>
          {kind === "CLASS" && (
            <select value={classTypeId} onChange={(e) => setClassTypeId(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2">
              {props.classTypes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <select
            value={trainerId}
            onChange={(e) => setTrainerId(e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 ${isBlocked ? "border-red-300 bg-red-50" : "border-stone-300"}`}
          >
            {props.trainers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2">
            {props.locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1 rounded-lg border border-stone-300 px-3 py-2" />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28 rounded-lg border border-stone-300 px-3 py-2" />
          </div>
          {isBlocked && (
            <p className="text-xs text-red-600">This trainer marked themselves unavailable on {date}.</p>
          )}
          <div className="flex gap-2">
            <input
              type="number"
              placeholder={`Capacity (${kind === "CLASS" ? (ct?.defaultCapacity ?? 8) : 1})`}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
            />
            <input
              type="number"
              step="0.01"
              placeholder={`Price GHS (${((kind === "CLASS" ? (ct?.priceGHS ?? 0) : (tr?.ptRateGHS ?? 0)) / 100).toFixed(0)})`}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
            />
          </div>
          {kind === "CLASS" && (
            <label className="flex items-center gap-2 text-stone-600">
              <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
              Repeat weekly (creates 4 weeks + ongoing rule)
            </label>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={props.onClose} className="rounded-lg border border-stone-300 px-4 py-2 text-sm">Cancel</button>
          <button onClick={submit} disabled={!date || !locationId || isBlocked} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
