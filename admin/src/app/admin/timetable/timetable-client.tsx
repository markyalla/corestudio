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
  trainerId: string;
  locationId: string | null;
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
  defaultTrainerId: string | null;
};
type TrainerOpt = { id: string; name: string; color: string; ptRateGHS: number };
type MemberOpt = { id: string; name: string; creditsLeft: number; status: string };
type LocationOpt = { id: string; name: string };
type UnavailabilityRow = { trainerId: string; date: string };

type View = "day" | "week" | "month";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function hhmm(iso: string) {
  return iso.slice(11, 16);
}
function dayKey(iso: string) {
  return iso.slice(0, 10);
}
function addDaysUTC(d: Date, n: number) {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}
function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function labelFor(view: View, anchor: Date) {
  if (view === "day") {
    return anchor.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  }
  if (view === "week") {
    const end = addDaysUTC(anchor, 6);
    return `Week of ${anchor.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} – ${end.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
  }
  return anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
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

function SessionChip({ s, onClick, dense }: { s: SessionRow; onClick: () => void; dense?: boolean }) {
  const booked = s.bookings.filter((b) => ["BOOKED", "ATTENDED"].includes(b.status)).length;
  const wait = s.bookings.filter((b) => b.status === "WAITLIST").length;
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border-l-4 text-left ${dense ? "px-1.5 py-1 text-[11px]" : "px-2 py-1.5 text-xs"} ${
        s.status === "CANCELLED" ? "bg-stone-100 opacity-50" : "bg-stone-50 hover:bg-stone-100"
      }`}
      style={{ borderLeftColor: s.trainer.calendarColor }}
    >
      <p className="truncate font-semibold text-stone-800">
        {hhmm(s.startsAt)} {s.classType?.name ?? "Private class"}
        {s.status === "CANCELLED" && " (cancelled)"}
      </p>
      {!dense && (
        <>
          <p className="truncate text-stone-500">
            {s.trainer.user.name}
            {s.location && ` · ${s.location.name}`}
          </p>
          <p className="text-stone-400">
            {booked}/{s.capacity}
            {wait > 0 && ` +${wait} WL`}
          </p>
        </>
      )}
      {dense && (
        <p className="truncate text-stone-400">
          {s.trainer.user.name} · {booked}/{s.capacity}
        </p>
      )}
    </button>
  );
}

export function TimetableClient(props: {
  view: View;
  anchor: string; // YYYY-MM-DD
  gridStart: string; // YYYY-MM-DD — month grid first day / week monday / the day
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

  const { view } = props;
  const anchor = new Date(props.anchor + "T00:00:00Z");
  const gridStart = new Date(props.gridStart + "T00:00:00Z");
  const todayStr = ymd(new Date());

  const byDay = new Map<string, SessionRow[]>();
  for (const s of props.sessions) {
    const k = dayKey(s.startsAt);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(s);
  }
  const sessionsOn = (d: Date) =>
    (byDay.get(ymd(d)) ?? []).slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  function href(v: View, d: Date) {
    return `?view=${v}&date=${ymd(d)}`;
  }
  const prev =
    view === "month"
      ? new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 1, 1))
      : addDaysUTC(anchor, view === "week" ? -7 : -1);
  const next =
    view === "month"
      ? new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1))
      : addDaysUTC(anchor, view === "week" ? 7 : 1);

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

  const navBtn = "rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-50";
  const tab = (v: View) =>
    `rounded-lg px-3 py-1.5 text-sm ${v === view ? "bg-stone-900 text-white" : "border border-stone-300 bg-white hover:bg-stone-50"}`;

  return (
    <main className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-stone-900">Timetable</h1>
        <div className="flex items-center gap-2">
          <a href={href("day", anchor)} className={tab("day")}>Day</a>
          <a href={href("week", anchor)} className={tab("week")}>Week</a>
          <a href={href("month", anchor)} className={tab("month")}>Month</a>
        </div>
        <div className="flex items-center gap-2">
          <a href={href(view, prev)} className={navBtn}>←</a>
          <a href={href(view, new Date())} className={navBtn}>Today</a>
          <a href={href(view, next)} className={navBtn}>→</a>
          {!props.isTrainer && (
            <button
              onClick={() => setShowCreate(true)}
              className="ml-2 rounded-lg bg-stone-900 px-4 py-1.5 text-sm font-medium text-white"
            >
              + Session
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm text-stone-500">{labelFor(view, anchor)}</p>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {view === "month" && (
        <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-stone-200">
          <div className="grid grid-cols-7 gap-px">
            {DAYS.map((d) => (
              <div key={d} className="bg-stone-50 py-1.5 text-center text-xs font-medium text-stone-500">{d}</div>
            ))}
            {Array.from({ length: 42 }, (_, i) => addDaysUTC(gridStart, i)).map((d) => {
              const inMonth = d.getUTCMonth() === anchor.getUTCMonth();
              const list = sessionsOn(d);
              return (
                <div key={ymd(d)} className={`min-h-[116px] bg-white p-1 ${inMonth ? "" : "bg-stone-50/60"}`}>
                  <a
                    href={href("day", d)}
                    className={`inline-block rounded px-1 text-xs font-medium hover:bg-stone-100 ${
                      ymd(d) === todayStr ? "bg-stone-900 text-white" : inMonth ? "text-stone-600" : "text-stone-300"
                    }`}
                  >
                    {d.getUTCDate()}
                  </a>
                  <div className="mt-1 max-h-[88px] space-y-0.5 overflow-y-auto">
                    {list.map((s) => (
                      <SessionChip key={s.id} s={s} onClick={() => setOpenSession(s)} dense />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "week" && (
        <div className="mt-4 grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }, (_, i) => addDaysUTC(gridStart, i)).map((d, i) => (
            <div key={ymd(d)} className="min-h-[60vh] rounded-xl bg-white p-2 shadow-sm">
              <a href={href("day", d)} className={`mb-2 block text-center text-xs font-medium ${ymd(d) === todayStr ? "text-stone-900" : "text-stone-500"}`}>
                {DAYS[i]} {d.getUTCDate()}
              </a>
              <div className="space-y-1.5">
                {sessionsOn(d).map((s) => (
                  <SessionChip key={s.id} s={s} onClick={() => setOpenSession(s)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "day" && (
        <div className="mt-4 max-w-xl space-y-2">
          {sessionsOn(anchor).length === 0 && (
            <p className="rounded-xl bg-white p-6 text-center text-sm text-stone-400 shadow-sm">No classes this day.</p>
          )}
          {sessionsOn(anchor).map((s) => (
            <SessionChip key={s.id} s={s} onClick={() => setOpenSession(s)} />
          ))}
        </div>
      )}

      {openSession && (
        <RosterDrawer
          session={openSession}
          members={props.members}
          trainers={props.trainers}
          locations={props.locations}
          unavailability={props.unavailability}
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
  trainers: TrainerOpt[];
  locations: LocationOpt[];
  unavailability: UnavailabilityRow[];
  isTrainer: boolean;
  onClose: () => void;
  onAction: (a: () => Promise<string | null>) => void;
}) {
  const s = props.session;
  const [memberQuery, setMemberQuery] = useState("");
  const [paidWith, setPaidWith] = useState("CREDIT");
  const [editing, setEditing] = useState(false);
  const active = s.bookings.filter((b) => b.status !== "CANCELLED");
  const matches = memberQuery
    ? props.members.filter((m) => m.name.toLowerCase().includes(memberQuery.toLowerCase())).slice(0, 5)
    : [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={props.onClose}>
      <div className="h-full w-96 overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">{s.classType?.name ?? "Private class session"}</h2>
            <p className="text-sm text-stone-500">
              {new Date(s.startsAt).toISOString().slice(0, 16).replace("T", " ")} · {s.trainer.user.name} ·{" "}
              {formatGHS(s.priceGHS)}
              {s.location ? ` · ${s.location.name}` : " · No location set"}
            </p>
          </div>
          <button onClick={props.onClose} className="text-stone-400 hover:text-stone-600">✕</button>
        </div>

        {!props.isTrainer && s.status === "SCHEDULED" && (
          <button
            onClick={() => setEditing(!editing)}
            className="mt-3 rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50"
          >
            {editing ? "Close edit" : "Edit"}
          </button>
        )}
        {editing && (
          <SessionEditForm
            session={s}
            trainers={props.trainers}
            locations={props.locations}
            unavailability={props.unavailability}
            onAction={props.onAction}
          />
        )}

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
              <option value="PACKAGE">Package</option>
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

            <div className="mt-8 flex gap-2">
              <button
                onClick={() => {
                  if (confirm("Cancel this session and refund every member (credit back, or cash back to their wallet)?")) {
                    props.onAction(() => api(`/api/sessions/${s.id}`, "PATCH", { action: "CANCEL", mode: "REFUND" }));
                  }
                }}
                className="flex-1 rounded-lg border border-red-200 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                Cancel &amp; refund
              </button>
              <button
                onClick={() => {
                  if (confirm("Cancel this session and give every member a free class credit to rebook another time (no cash refund)?")) {
                    props.onAction(() => api(`/api/sessions/${s.id}`, "PATCH", { action: "CANCEL", mode: "RESCHEDULE" }));
                  }
                }}
                className="flex-1 rounded-lg border border-stone-300 py-2 text-sm text-stone-700 hover:bg-stone-50"
              >
                Cancel &amp; reschedule
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SessionEditForm(props: {
  session: SessionRow;
  trainers: TrainerOpt[];
  locations: LocationOpt[];
  unavailability: UnavailabilityRow[];
  onAction: (a: () => Promise<string | null>) => void;
}) {
  const s = props.session;
  const startsAt = new Date(s.startsAt);
  const [trainerId, setTrainerId] = useState(s.trainerId);
  const [locationId, setLocationId] = useState(s.locationId ?? props.locations[0]?.id ?? "");
  const [date, setDate] = useState(startsAt.toISOString().slice(0, 10));
  const [time, setTime] = useState(startsAt.toISOString().slice(11, 16));
  const [capacity, setCapacity] = useState(String(s.capacity));
  const [price, setPrice] = useState(String(s.priceGHS / 100));

  const isBlocked = props.unavailability.some((u) => u.trainerId === trainerId && u.date === date);

  function save() {
    props.onAction(() =>
      api(`/api/sessions/${s.id}`, "PATCH", {
        trainerId,
        locationId,
        startsAt: `${date}T${time}:00.000Z`,
        capacity: Number(capacity),
        priceGHS: parseGHS(price),
      }),
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg bg-stone-50 p-3 text-sm">
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
      {isBlocked && <p className="text-xs text-red-600">This trainer marked themselves unavailable on {date}.</p>}
      <div className="flex gap-2">
        <input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Capacity" className="flex-1 rounded-lg border border-stone-300 px-3 py-2" />
        <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price GHS" className="flex-1 rounded-lg border border-stone-300 px-3 py-2" />
      </div>
      <button
        onClick={save}
        disabled={!locationId || isBlocked}
        className="w-full rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Save changes
      </button>
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
  // Private (one-on-one) class types are seeded with defaultCapacity 1 (see
  // applyClan7()) — that's the signal that distinguishes a bookable private
  // service (Physiotherapy, Thai Massage, Pilates (Maryam), ...) from a
  // group class type. Single-trainer services also carry defaultTrainerId,
  // so picking one auto-fills the trainer and price below.
  const groupClassTypes = props.classTypes.filter((c) => c.defaultCapacity > 1);
  const privateClassTypes = props.classTypes.filter((c) => c.defaultCapacity <= 1);

  const [kind, setKind] = useState("CLASS");
  const [classTypeId, setClassTypeId] = useState(groupClassTypes[0]?.id ?? "");
  const [ptClassTypeId, setPtClassTypeId] = useState("");
  const [trainerId, setTrainerId] = useState(props.trainers[0]?.id ?? "");
  const [locationId, setLocationId] = useState(props.locations[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("17:30");
  const [capacity, setCapacity] = useState("");
  const [price, setPrice] = useState("");
  const [recurring, setRecurring] = useState(false);

  const ct = props.classTypes.find((c) => c.id === (kind === "CLASS" ? classTypeId : ptClassTypeId));
  const tr = props.trainers.find((t) => t.id === trainerId);
  const isBlocked = date
    ? props.unavailability.some((u) => u.trainerId === trainerId && u.date === date)
    : false;

  function onSelectPtClassType(id: string) {
    setPtClassTypeId(id);
    const svc = privateClassTypes.find((c) => c.id === id);
    setPrice(svc ? String(svc.priceGHS / 100) : "");
    if (svc?.defaultTrainerId) setTrainerId(svc.defaultTrainerId);
  }

  function submit() {
    const startsAt = `${date}T${time}:00.000Z`; // Africa/Accra == UTC
    const body = {
      kind,
      classTypeId: kind === "CLASS" ? classTypeId : ptClassTypeId || undefined,
      trainerId,
      locationId,
      startsAt,
      durationMins: ct?.durationMins ?? 60,
      capacity: capacity ? Number(capacity) : kind === "CLASS" ? (ct?.defaultCapacity ?? 8) : 1,
      priceGHS: price ? parseGHS(price) : ct ? ct.priceGHS : kind === "CLASS" ? 0 : (tr?.ptRateGHS ?? 0),
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
            <option value="CLASS">Group class</option>
            <option value="PT">Private class</option>
          </select>
          {kind === "CLASS" ? (
            <select value={classTypeId} onChange={(e) => setClassTypeId(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2">
              {groupClassTypes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <select value={ptClassTypeId} onChange={(e) => onSelectPtClassType(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2">
              <option value="">Flat trainer rate (no specific service)</option>
              {privateClassTypes.map((c) => (
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
              placeholder={`Price GHS (${((ct ? ct.priceGHS : (tr?.ptRateGHS ?? 0)) / 100).toFixed(0)})`}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
            />
          </div>
          {kind === "CLASS" && (
            <div className="text-stone-600">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
                Repeat weekly
              </label>
              {recurring && (
                <p className="mt-1 text-xs text-stone-400">
                  Runs every week during{" "}
                  {date
                    ? new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
                    : "that month"}{" "}
                  only — add it again for other months.
                </p>
              )}
            </div>
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
