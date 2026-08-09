"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS, parseGHS } from "@backend/lib/money";

type Studio = {
  name: string;
  momoNumber: string | null;
  advanceBookingDays: number;
  cancelCutoffHours: number;
  timezone: string;
};
type Perk = { id: string; name: string; active: boolean };
type Plan = {
  id: string; name: string; priceGHS: number; classesPerCycle: number; bonusCredits: number;
  cycleDays: number; description: string; active: boolean; perks: Perk[];
};
type ClassType = {
  id: string; name: string; durationMins: number; priceGHS: number;
  defaultCapacity: number; description: string; active: boolean;
};
type Location = { id: string; name: string; address: string; active: boolean };

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

const input = "rounded-lg border border-stone-300 px-3 py-2 text-sm";
const btn = "rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

export function SettingsClient(props: {
  isOwner: boolean;
  studio: Studio;
  plans: Plan[];
  classTypes: ClassType[];
  locations: Location[];
  perks: Perk[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  async function run(action: () => Promise<string | null>, ok: string) {
    setMsg(null);
    const err = await action();
    setMsg(err ?? ok);
    if (!err) router.refresh();
    return err;
  }

  return (
    <main className="max-w-3xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold text-stone-900">Settings</h1>
      {msg && <p className="rounded-lg bg-stone-200 px-3 py-2 text-sm text-stone-700">{msg}</p>}

      <StudioSection studio={props.studio} onRun={run} />
      <PerksSection perks={props.perks} onRun={run} />
      <PlansSection plans={props.plans} perks={props.perks} onRun={run} />
      <ClassTypesSection classTypes={props.classTypes} onRun={run} />
      <LocationsSection locations={props.locations} onRun={run} />
      {props.isOwner && <StaffSection onRun={run} />}
    </main>
  );
}

function StudioSection({ studio, onRun }: { studio: Studio; onRun: (a: () => Promise<string | null>, ok: string) => void }) {
  const [form, setForm] = useState({
    name: studio.name,
    momoNumber: studio.momoNumber ?? "",
    advanceBookingDays: String(studio.advanceBookingDays),
    cancelCutoffHours: String(studio.cancelCutoffHours),
  });
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-stone-700">Studio</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`mt-1 w-full ${input}`} /></label>
        <label>MoMo number<input value={form.momoNumber} onChange={(e) => setForm({ ...form, momoNumber: e.target.value })} className={`mt-1 w-full ${input}`} /></label>
        <label>Advance booking days<input type="number" value={form.advanceBookingDays} onChange={(e) => setForm({ ...form, advanceBookingDays: e.target.value })} className={`mt-1 w-full ${input}`} /></label>
        <label>Cancel cutoff (hours)<input type="number" value={form.cancelCutoffHours} onChange={(e) => setForm({ ...form, cancelCutoffHours: e.target.value })} className={`mt-1 w-full ${input}`} /></label>
      </div>
      <p className="mt-2 text-xs text-stone-400">Timezone: {studio.timezone}</p>
      <button
        className={`mt-4 ${btn}`}
        onClick={() =>
          onRun(
            () =>
              api("/api/settings", "PATCH", {
                name: form.name,
                momoNumber: form.momoNumber || null,
                advanceBookingDays: Number(form.advanceBookingDays),
                cancelCutoffHours: Number(form.cancelCutoffHours),
              }),
            "Studio settings saved.",
          )
        }
      >
        Save
      </button>
    </section>
  );
}

function PlansSection({ plans, perks, onRun }: { plans: Plan[]; perks: Perk[]; onRun: (a: () => Promise<string | null>, ok: string) => Promise<string | null> }) {
  const [form, setForm] = useState({ name: "", price: "", classes: "", bonus: "0", cycleDays: "30", perkIds: [] as string[] });
  const [editingId, setEditingId] = useState<string | null>(null);

  function togglePerk(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((p) => p !== id) : [...list, id];
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-stone-700">Membership plans</h2>
      <div className="mt-3 divide-y divide-stone-100">
        {plans.map((p) => (
          <div key={p.id} className="py-2 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-stone-800">{p.name}</p>
                <p className="text-stone-600">
                  {formatGHS(p.priceGHS)} · {p.classesPerCycle} classes + {p.bonusCredits} bonus / {p.cycleDays}d
                  {p.perks.length > 0 && ` · ${p.perks.map((pk) => pk.name).join(", ")}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onRun(() => api("/api/plans", "PATCH", { id: p.id, active: !p.active }), "Plan updated.")}
                  className={`rounded-full px-3 py-1 text-xs ${p.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
                >
                  {p.active ? "Active" : "Inactive"}
                </button>
                <button
                  onClick={() => setEditingId(editingId === p.id ? null : p.id)}
                  className="rounded-lg border border-stone-300 px-3 py-1 text-xs text-stone-600"
                >
                  {editingId === p.id ? "Close" : "Edit"}
                </button>
              </div>
            </div>
            {editingId === p.id && (
              <PlanEditRow plan={p} perks={perks} onRun={onRun} onDone={() => setEditingId(null)} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-stone-100 pt-3">
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
        <input placeholder="Price GHS" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={`w-28 ${input}`} />
        <input placeholder="Classes/cycle" type="number" value={form.classes} onChange={(e) => setForm({ ...form, classes: e.target.value })} className={`w-32 ${input}`} />
        <input placeholder="Bonus classes" type="number" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} className={`w-28 ${input}`} />
        <input placeholder="Cycle days" type="number" value={form.cycleDays} onChange={(e) => setForm({ ...form, cycleDays: e.target.value })} className={`w-28 ${input}`} />
        <div className="flex flex-wrap gap-2">
          {perks.map((perk) => (
            <label key={perk.id} className="flex items-center gap-1 rounded-lg border border-stone-300 px-2 py-1 text-xs">
              <input
                type="checkbox"
                checked={form.perkIds.includes(perk.id)}
                onChange={() => setForm({ ...form, perkIds: togglePerk(form.perkIds, perk.id) })}
              />
              {perk.name}
            </label>
          ))}
        </div>
        <button
          disabled={!form.name || !form.price || !form.classes}
          className={btn}
          onClick={() =>
            onRun(
              () =>
                api("/api/plans", "POST", {
                  name: form.name,
                  priceGHS: parseGHS(form.price),
                  classesPerCycle: Number(form.classes),
                  bonusCredits: Number(form.bonus || "0"),
                  cycleDays: Number(form.cycleDays),
                  perkIds: form.perkIds,
                }),
              "Plan created.",
            )
          }
        >
          Add
        </button>
      </div>
    </section>
  );
}

function PlanEditRow({ plan, perks, onRun, onDone }: {
  plan: Plan; perks: Perk[]; onRun: (a: () => Promise<string | null>, ok: string) => Promise<string | null>; onDone: () => void;
}) {
  const [classes, setClasses] = useState(String(plan.classesPerCycle));
  const [bonus, setBonus] = useState(String(plan.bonusCredits));
  const [perkIds, setPerkIds] = useState(plan.perks.map((p) => p.id));

  function togglePerk(id: string) {
    setPerkIds((list) => (list.includes(id) ? list.filter((p) => p !== id) : [...list, id]));
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 p-3 text-xs">
      <label className="flex items-center gap-1">
        Classes
        <input type="number" value={classes} onChange={(e) => setClasses(e.target.value)} className={`w-20 ${input}`} />
      </label>
      <label className="flex items-center gap-1">
        Bonus
        <input type="number" value={bonus} onChange={(e) => setBonus(e.target.value)} className={`w-20 ${input}`} />
      </label>
      <div className="flex flex-wrap gap-2">
        {perks.map((perk) => (
          <label key={perk.id} className="flex items-center gap-1 rounded-lg border border-stone-300 px-2 py-1">
            <input type="checkbox" checked={perkIds.includes(perk.id)} onChange={() => togglePerk(perk.id)} />
            {perk.name}
          </label>
        ))}
      </div>
      <button
        className={btn}
        onClick={() =>
          onRun(
            () =>
              api("/api/plans", "PATCH", {
                id: plan.id,
                classesPerCycle: Number(classes),
                bonusCredits: Number(bonus),
                perkIds,
              }),
            "Plan updated.",
          ).then((err) => {
            if (!err) onDone();
          })
        }
      >
        Save
      </button>
    </div>
  );
}

function PerksSection({ perks, onRun }: { perks: Perk[]; onRun: (a: () => Promise<string | null>, ok: string) => void }) {
  const [name, setName] = useState("");
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-stone-700">Plan perks</h2>
      <p className="mt-1 text-xs text-stone-400">Reusable items (mat, water, towel…) that plans can include.</p>
      <table className="mt-3 w-full text-left text-sm">
        <tbody>
          {perks.map((p) => (
            <tr key={p.id} className="border-t border-stone-100">
              <td className="py-2 font-medium text-stone-800">{p.name}</td>
              <td className="py-2 text-right">
                <button
                  onClick={() => onRun(() => api("/api/perks", "PATCH", { id: p.id, active: !p.active }), "Perk updated.")}
                  className={`rounded-full px-3 py-1 text-xs ${p.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
                >
                  {p.active ? "Active" : "Inactive"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
        <button
          disabled={!name}
          className={btn}
          onClick={() => onRun(() => api("/api/perks", "POST", { name }).then((e) => { if (!e) setName(""); return e; }), "Perk created.")}
        >
          Add
        </button>
      </div>
    </section>
  );
}

function LocationsSection({ locations, onRun }: { locations: Location[]; onRun: (a: () => Promise<string | null>, ok: string) => void }) {
  const [form, setForm] = useState({ name: "", address: "" });
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-stone-700">Locations</h2>
      <table className="mt-3 w-full text-left text-sm">
        <tbody>
          {locations.map((l) => (
            <tr key={l.id} className="border-t border-stone-100">
              <td className="py-2 font-medium text-stone-800">{l.name}</td>
              <td className="py-2 text-stone-600">{l.address}</td>
              <td className="py-2 text-right">
                <button
                  onClick={() => onRun(() => api("/api/locations", "PATCH", { id: l.id, active: !l.active }), "Location updated.")}
                  className={`rounded-full px-3 py-1 text-xs ${l.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
                >
                  {l.active ? "Active" : "Inactive"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
        <input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={input} />
        <button
          disabled={!form.name}
          className={btn}
          onClick={() =>
            onRun(
              () => api("/api/locations", "POST", { name: form.name, address: form.address }),
              "Location created.",
            )
          }
        >
          Add
        </button>
      </div>
    </section>
  );
}

function ClassTypesSection({ classTypes, onRun }: { classTypes: ClassType[]; onRun: (a: () => Promise<string | null>, ok: string) => void }) {
  const [form, setForm] = useState({ name: "", price: "", duration: "55", capacity: "8" });
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-stone-700">Class types</h2>
      <table className="mt-3 w-full text-left text-sm">
        <tbody>
          {classTypes.map((c) => (
            <tr key={c.id} className="border-t border-stone-100">
              <td className="py-2 font-medium text-stone-800">{c.name}</td>
              <td className="py-2 text-stone-600">{c.durationMins} min</td>
              <td className="py-2 text-stone-600">{formatGHS(c.priceGHS)}</td>
              <td className="py-2 text-stone-600">cap {c.defaultCapacity}</td>
              <td className="py-2 text-right">
                <button
                  onClick={() => onRun(() => api("/api/class-types", "PATCH", { id: c.id, active: !c.active }), "Class type updated.")}
                  className={`rounded-full px-3 py-1 text-xs ${c.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
                >
                  {c.active ? "Active" : "Inactive"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
        <input placeholder="Price GHS" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={`w-28 ${input}`} />
        <input placeholder="Mins" type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className={`w-20 ${input}`} />
        <input placeholder="Capacity" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className={`w-24 ${input}`} />
        <button
          disabled={!form.name || !form.price}
          className={btn}
          onClick={() =>
            onRun(
              () =>
                api("/api/class-types", "POST", {
                  name: form.name,
                  priceGHS: parseGHS(form.price),
                  durationMins: Number(form.duration),
                  defaultCapacity: Number(form.capacity),
                }),
              "Class type created.",
            )
          }
        >
          Add
        </button>
      </div>
    </section>
  );
}

function StaffSection({ onRun }: { onRun: (a: () => Promise<string | null>, ok: string) => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "ADMIN" });
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-stone-700">Invite staff</h2>
      <p className="mt-1 text-xs text-stone-400">A temporary password is texted to their phone.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={`bg-white ${input}`}>
          <option value="ADMIN">Admin</option>
          <option value="OWNER">Owner</option>
        </select>
        <button
          disabled={!form.name || !form.email || !form.phone}
          className={btn}
          onClick={() => onRun(() => api("/api/staff", "POST", form), "Invite sent.")}
        >
          Invite
        </button>
      </div>
    </section>
  );
}
