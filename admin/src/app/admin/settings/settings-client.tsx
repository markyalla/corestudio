"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS, parseGHS } from "@backend/lib/money";
import { fileToResizedDataUrl } from "@/lib/image";

type Studio = {
  name: string;
  momoNumber: string | null;
  contactEmail: string;
  whatsapp: string;
  advanceBookingDays: number;
  cancelCutoffHours: number;
  timezone: string;
  socialSecurityPercent: number;
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
type Package = {
  id: string; name: string; classTypeId: string; classType: { name: string };
  sessionsGranted: number; priceGHS: number; validDays: number; active: boolean; perks: Perk[];
};
type Location = { id: string; name: string; address: string; phone: string; active: boolean };
type Announcement = {
  id: string; kind: "ANNOUNCEMENT" | "PROMOTION"; title: string; body: string;
  imageUrl: string | null; active: boolean; endsAt: string | null; createdAt: string;
};
type MotivationMessage = { id: string; text: string; active: boolean; createdAt: string };

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

function ImagePicker({ value, onChange }: { value: string | null; onChange: (dataUrl: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {value && <img src={value} alt="" className="h-12 w-20 rounded-lg border border-stone-200 object-cover" />}
      <label className="cursor-pointer rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50">
        {busy ? "Processing…" : value ? "Change image" : "Add image (optional)"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setError(null);
            setBusy(true);
            try {
              onChange(await fileToResizedDataUrl(file));
            } catch {
              setError("Couldn't read that image — try a different file.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="text-xs text-red-600 underline">
          Remove image
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

/** Confirm-then-delete button shared by every settings list section. Backend
 *  DELETE routes reject with a friendly 409 if the item is still referenced
 *  elsewhere (e.g. a plan with members on it) — that message surfaces via onRun. */
function DeleteButton({ path, id, label, onRun }: {
  path: string; id: string; label: string;
  onRun: (a: () => Promise<string | null>, ok: string) => void;
}) {
  return (
    <button
      onClick={() => {
        if (!window.confirm(`Delete "${label}"? This can't be undone.`)) return;
        onRun(() => api(path, "DELETE", { id }), "Deleted.");
      }}
      className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
    >
      Delete
    </button>
  );
}

export function SettingsClient(props: {
  isOwner: boolean;
  isAdmin: boolean;
  studio: Studio;
  plans: Plan[];
  classTypes: ClassType[];
  packages: Package[];
  locations: Location[];
  perks: Perk[];
  announcements: Announcement[];
  motivationMessages: MotivationMessage[];
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
      <AnnouncementsSection announcements={props.announcements} onRun={run} />
      <MotivationSection messages={props.motivationMessages} onRun={run} />
      {props.isOwner && <BroadcastNumbersSection />}
      <PerksSection perks={props.perks} onRun={run} />
      <PlansSection plans={props.plans} perks={props.perks} onRun={run} />
      <ClassTypesSection classTypes={props.classTypes} onRun={run} />
      <PackagesSection packages={props.packages} classTypes={props.classTypes} perks={props.perks} onRun={run} />
      <LocationsSection locations={props.locations} onRun={run} />
      {(props.isOwner || props.isAdmin) && <StaffSection isOwner={props.isOwner} onRun={run} />}
    </main>
  );
}

function StudioSection({ studio, onRun }: { studio: Studio; onRun: (a: () => Promise<string | null>, ok: string) => void }) {
  const [form, setForm] = useState({
    name: studio.name,
    momoNumber: studio.momoNumber ?? "",
    contactEmail: studio.contactEmail,
    whatsapp: studio.whatsapp,
    advanceBookingDays: String(studio.advanceBookingDays),
    cancelCutoffHours: String(studio.cancelCutoffHours),
    socialSecurityPercent: String(studio.socialSecurityPercent),
  });
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-stone-700">Studio</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`mt-1 w-full ${input}`} /></label>
        <label>MoMo number<input value={form.momoNumber} onChange={(e) => setForm({ ...form, momoNumber: e.target.value })} className={`mt-1 w-full ${input}`} /></label>
        <label>Help-desk email<input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} className={`mt-1 w-full ${input}`} /></label>
        <label>Help-desk WhatsApp<input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="+233..." className={`mt-1 w-full ${input}`} /></label>
        <label>Advance booking days<input type="number" value={form.advanceBookingDays} onChange={(e) => setForm({ ...form, advanceBookingDays: e.target.value })} className={`mt-1 w-full ${input}`} /></label>
        <label>Cancel cutoff (hours)<input type="number" value={form.cancelCutoffHours} onChange={(e) => setForm({ ...form, cancelCutoffHours: e.target.value })} className={`mt-1 w-full ${input}`} /></label>
        <label>Staff social security %<input type="number" value={form.socialSecurityPercent} onChange={(e) => setForm({ ...form, socialSecurityPercent: e.target.value })} className={`mt-1 w-full ${input}`} /></label>
      </div>
      <p className="mt-2 text-xs text-stone-400">
        Timezone: {studio.timezone}. Help-desk email/WhatsApp show to members in the app&apos;s Contact us section.
        Social security % is withheld from staff base salary each time payroll runs — see Payroll.
      </p>
      <button
        className={`mt-4 ${btn}`}
        onClick={() =>
          onRun(
            () =>
              api("/api/settings", "PATCH", {
                name: form.name,
                momoNumber: form.momoNumber || null,
                contactEmail: form.contactEmail,
                whatsapp: form.whatsapp,
                advanceBookingDays: Number(form.advanceBookingDays),
                cancelCutoffHours: Number(form.cancelCutoffHours),
                socialSecurityPercent: Number(form.socialSecurityPercent),
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
  const [form, setForm] = useState({ name: "", price: "", classes: "", bonus: "0", cycleDays: "30", description: "", perkIds: [] as string[] });
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
                {p.description ? (
                  <p className="mt-0.5 truncate text-xs text-stone-400">{p.description}</p>
                ) : (
                  <p className="mt-0.5 text-xs text-amber-600">No description yet</p>
                )}
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
                <DeleteButton path="/api/plans" id={p.id} label={p.name} onRun={onRun} />
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
        <textarea
          placeholder="Description — what members get, who it's for"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          className={`w-full ${input}`}
        />
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
                  description: form.description,
                  perkIds: form.perkIds,
                }),
              "Plan created.",
            ).then((err) => {
              if (!err) setForm({ name: "", price: "", classes: "", bonus: "0", cycleDays: "30", description: "", perkIds: [] });
            })
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
  const [description, setDescription] = useState(plan.description);
  const [perkIds, setPerkIds] = useState(plan.perks.map((p) => p.id));

  function togglePerk(id: string) {
    setPerkIds((list) => (list.includes(id) ? list.filter((p) => p !== id) : [...list, id]));
  }

  return (
    <div className="mt-2 flex flex-wrap items-start gap-2 rounded-lg bg-stone-50 p-3 text-xs">
      <label className="flex items-center gap-1">
        Classes
        <input type="number" value={classes} onChange={(e) => setClasses(e.target.value)} className={`w-20 ${input}`} />
      </label>
      <label className="flex items-center gap-1">
        Bonus
        <input type="number" value={bonus} onChange={(e) => setBonus(e.target.value)} className={`w-20 ${input}`} />
      </label>
      <textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className={`w-full ${input}`}
      />
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
                description,
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
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => onRun(() => api("/api/perks", "PATCH", { id: p.id, active: !p.active }), "Perk updated.")}
                    className={`rounded-full px-3 py-1 text-xs ${p.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
                  >
                    {p.active ? "Active" : "Inactive"}
                  </button>
                  <DeleteButton path="/api/perks" id={p.id} label={p.name} onRun={onRun} />
                </div>
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

function MotivationSection({ messages, onRun }: {
  messages: MotivationMessage[]; onRun: (a: () => Promise<string | null>, ok: string) => Promise<string | null>;
}) {
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const activeCount = messages.filter((m) => m.active).length;
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-stone-700">Daily motivation</h2>
      <p className="mt-1 text-xs text-stone-400">
        One shows on the app Home each day, rotating automatically through the {activeCount} active line{activeCount === 1 ? "" : "s"}.
      </p>
      <div className="mt-3 divide-y divide-stone-100">
        {messages.map((m) => (
          <div key={m.id} className="py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              {editingId === m.id ? (
                <input value={draft} onChange={(e) => setDraft(e.target.value)} className={`min-w-64 flex-1 ${input}`} />
              ) : (
                <p className={`min-w-0 flex-1 ${m.active ? "text-stone-800" : "text-stone-400 line-through"}`}>{m.text}</p>
              )}
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => onRun(() => api("/api/motivation", "PATCH", { id: m.id, active: !m.active }), "Updated.")}
                  className={`rounded-full px-3 py-1 text-xs ${m.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
                >
                  {m.active ? "Active" : "Off"}
                </button>
                {editingId === m.id ? (
                  <button
                    className={btn}
                    onClick={() =>
                      onRun(() => api("/api/motivation", "PATCH", { id: m.id, text: draft }), "Updated.").then((e) => {
                        if (!e) setEditingId(null);
                      })
                    }
                  >
                    Save
                  </button>
                ) : (
                  <button
                    onClick={() => { setEditingId(m.id); setDraft(m.text); }}
                    className="rounded-lg border border-stone-300 px-3 py-1 text-xs text-stone-600"
                  >
                    Edit
                  </button>
                )}
                <DeleteButton path="/api/motivation" id={m.id} label={m.text} onRun={onRun} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
        <input placeholder="A short motivational line…" value={text} onChange={(e) => setText(e.target.value)} className={`min-w-64 flex-1 ${input}`} />
        <button
          disabled={!text.trim()}
          className={btn}
          onClick={() =>
            onRun(() => api("/api/motivation", "POST", { text: text.trim() }).then((e) => { if (!e) setText(""); return e; }), "Added.")
          }
        >
          Add
        </button>
      </div>
    </section>
  );
}

function BroadcastNumbersSection() {
  const [audience, setAudience] = useState<"all" | "active">("all");
  const [data, setData] = useState<{ count: number; joined: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/members/phones?audience=${audience}`);
    if (res.ok) setData(await res.json());
  }, [audience]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / on audience change
    load();
  }, [load]);

  function copyNumbers() {
    navigator.clipboard.writeText(data?.joined ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-stone-700">Member phone numbers</h2>
      <p className="mt-1 text-xs text-stone-400">
        Numbers only. WhatsApp has no link that messages many numbers at once — copy these, open
        WhatsApp Web, then <span className="font-medium">New broadcast</span> and paste them in.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={audience} onChange={(e) => setAudience(e.target.value as "all" | "active")} className={`bg-white ${input}`}>
          <option value="all">All members</option>
          <option value="active">Active only</option>
        </select>
        <span className="text-xs text-stone-500">{data?.count ?? 0} number{data?.count === 1 ? "" : "s"}</span>
        <button className={btn} onClick={copyNumbers}>
          {copied ? "Copied" : "Copy numbers"}
        </button>
        <button
          type="button"
          disabled={!data?.count}
          onClick={() => {
            copyNumbers();
            window.open("https://web.whatsapp.com/", "_blank", "noopener,noreferrer");
          }}
          className="rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Open WhatsApp Web
        </button>
      </div>
      <textarea
        readOnly
        value={data?.joined ?? ""}
        rows={6}
        className={`mt-3 w-full font-mono text-xs ${input}`}
      />
    </section>
  );
}

function AnnouncementsSection({ announcements, onRun }: {
  announcements: Announcement[]; onRun: (a: () => Promise<string | null>, ok: string) => Promise<string | null>;
}) {
  const [form, setForm] = useState({ kind: "ANNOUNCEMENT", title: "", body: "", endsAt: "", imageUrl: null as string | null });
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-stone-700">Announcements &amp; promotions</h2>
      <p className="mt-1 text-xs text-stone-400">Shown to members on the app Home screen. Inactive or past the &ldquo;show until&rdquo; date = hidden.</p>
      <div className="mt-3 divide-y divide-stone-100">
        {announcements.map((a) => (
          <div key={a.id} className="py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                {a.imageUrl && (
                  <img src={a.imageUrl} alt="" className="h-10 w-16 shrink-0 rounded-lg border border-stone-200 object-cover" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-stone-800">
                    <span className={`mr-2 rounded-full px-2 py-0.5 text-xs ${a.kind === "PROMOTION" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"}`}>
                      {a.kind === "PROMOTION" ? "Promo" : "Notice"}
                    </span>
                    {a.title}
                  </p>
                  <p className="truncate text-stone-600">
                    {a.body}
                    {a.endsAt && ` · until ${a.endsAt.slice(0, 10)}`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(a.body ? `${a.title}\n\n${a.body}` : a.title)}
                  className="rounded-lg border border-stone-300 px-3 py-1 text-xs text-stone-600"
                  title="Copy title + message for WhatsApp"
                >
                  Copy
                </button>
                <button
                  onClick={() => onRun(() => api("/api/announcements", "PATCH", { id: a.id, active: !a.active }), "Announcement updated.")}
                  className={`rounded-full px-3 py-1 text-xs ${a.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
                >
                  {a.active ? "Active" : "Inactive"}
                </button>
                <button
                  onClick={() => setEditingId(editingId === a.id ? null : a.id)}
                  className="rounded-lg border border-stone-300 px-3 py-1 text-xs text-stone-600"
                >
                  {editingId === a.id ? "Close" : "Edit"}
                </button>
                <DeleteButton path="/api/announcements" id={a.id} label={a.title} onRun={onRun} />
              </div>
            </div>
            {editingId === a.id && (
              <AnnouncementEditRow announcement={a} onRun={onRun} onDone={() => setEditingId(null)} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-stone-100 pt-3">
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={`bg-white ${input}`}>
          <option value="ANNOUNCEMENT">Notice</option>
          <option value="PROMOTION">Promotion</option>
        </select>
        <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={input} />
        <input placeholder="Message" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className={`min-w-64 flex-1 ${input}`} />
        <label className="flex items-center gap-1 text-xs text-stone-500">
          Show until
          <input type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className={input} />
        </label>
        <ImagePicker value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })} />
        <button
          disabled={!form.title}
          className={btn}
          onClick={() =>
            onRun(
              () =>
                api("/api/announcements", "POST", {
                  kind: form.kind,
                  title: form.title,
                  body: form.body,
                  imageUrl: form.imageUrl,
                  endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
                }).then((e) => {
                  if (!e) setForm({ kind: "ANNOUNCEMENT", title: "", body: "", endsAt: "", imageUrl: null });
                  return e;
                }),
              "Announcement posted.",
            )
          }
        >
          Post
        </button>
      </div>
    </section>
  );
}

function AnnouncementEditRow({ announcement, onRun, onDone }: {
  announcement: Announcement; onRun: (a: () => Promise<string | null>, ok: string) => Promise<string | null>; onDone: () => void;
}) {
  const [kind, setKind] = useState(announcement.kind);
  const [title, setTitle] = useState(announcement.title);
  const [body, setBody] = useState(announcement.body);
  const [imageUrl, setImageUrl] = useState(announcement.imageUrl);
  const [endsAt, setEndsAt] = useState(announcement.endsAt ? announcement.endsAt.slice(0, 10) : "");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 p-3 text-xs">
      <select value={kind} onChange={(e) => setKind(e.target.value as Announcement["kind"])} className={`bg-white ${input}`}>
        <option value="ANNOUNCEMENT">Notice</option>
        <option value="PROMOTION">Promotion</option>
      </select>
      <input value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
      <input value={body} onChange={(e) => setBody(e.target.value)} className={`min-w-56 flex-1 ${input}`} />
      <label className="flex items-center gap-1">
        Show until
        <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={input} />
      </label>
      <ImagePicker value={imageUrl} onChange={setImageUrl} />
      <button
        className={btn}
        onClick={() =>
          onRun(
            () =>
              api("/api/announcements", "PATCH", {
                id: announcement.id,
                kind,
                title,
                body,
                imageUrl,
                endsAt: endsAt ? new Date(endsAt).toISOString() : null,
              }),
            "Announcement updated.",
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

function LocationsSection({ locations, onRun }: { locations: Location[]; onRun: (a: () => Promise<string | null>, ok: string) => Promise<string | null> }) {
  const [form, setForm] = useState({ name: "", address: "", phone: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-stone-700">Locations</h2>
      <p className="mt-1 text-xs text-stone-400">Each location&apos;s phone number shows to members in the app&apos;s Contact us section.</p>
      <div className="mt-3 divide-y divide-stone-100">
        {locations.map((l) => (
          <div key={l.id} className="py-2 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-stone-800">{l.name}</p>
                <p className="text-stone-600">{l.address}{l.phone && ` · ${l.phone}`}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onRun(() => api("/api/locations", "PATCH", { id: l.id, active: !l.active }), "Location updated.")}
                  className={`rounded-full px-3 py-1 text-xs ${l.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
                >
                  {l.active ? "Active" : "Inactive"}
                </button>
                <button
                  onClick={() => setEditingId(editingId === l.id ? null : l.id)}
                  className="rounded-lg border border-stone-300 px-3 py-1 text-xs text-stone-600"
                >
                  {editingId === l.id ? "Close" : "Edit"}
                </button>
                <DeleteButton path="/api/locations" id={l.id} label={l.name} onRun={onRun} />
              </div>
            </div>
            {editingId === l.id && (
              <LocationEditRow location={l} onRun={onRun} onDone={() => setEditingId(null)} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
        <input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={input} />
        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} />
        <button
          disabled={!form.name}
          className={btn}
          onClick={() =>
            onRun(
              () => api("/api/locations", "POST", { name: form.name, address: form.address, phone: form.phone }),
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

function LocationEditRow({ location, onRun, onDone }: {
  location: Location; onRun: (a: () => Promise<string | null>, ok: string) => Promise<string | null>; onDone: () => void;
}) {
  const [address, setAddress] = useState(location.address);
  const [phone, setPhone] = useState(location.phone);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 p-3 text-xs">
      <label className="flex flex-1 items-center gap-1">
        Address
        <input value={address} onChange={(e) => setAddress(e.target.value)} className={`flex-1 ${input}`} />
      </label>
      <label className="flex items-center gap-1">
        Phone
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className={`w-40 ${input}`} />
      </label>
      <button
        className={btn}
        onClick={() =>
          onRun(
            () => api("/api/locations", "PATCH", { id: location.id, address, phone }),
            "Location updated.",
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

function ClassTypesSection({ classTypes, onRun }: { classTypes: ClassType[]; onRun: (a: () => Promise<string | null>, ok: string) => Promise<string | null> }) {
  const [form, setForm] = useState({ name: "", price: "", duration: "55", capacity: "8", description: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-stone-700">Class types</h2>
      <p className="mt-1 text-xs text-stone-400">
        The description shows to members on the class/session detail screen in the app — what it is,
        who it&apos;s for, what to bring.
      </p>
      <div className="mt-3 divide-y divide-stone-100">
        {classTypes.map((c) => (
          <div key={c.id} className="py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-stone-800">{c.name}</p>
                <p className="text-stone-600">
                  {c.durationMins} min · {formatGHS(c.priceGHS)} · cap {c.defaultCapacity}
                </p>
                {c.description ? (
                  <p className="mt-0.5 truncate text-xs text-stone-400">{c.description}</p>
                ) : (
                  <p className="mt-0.5 text-xs text-amber-600">No description yet</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => onRun(() => api("/api/class-types", "PATCH", { id: c.id, active: !c.active }), "Class type updated.")}
                  className={`rounded-full px-3 py-1 text-xs ${c.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
                >
                  {c.active ? "Active" : "Inactive"}
                </button>
                <button
                  onClick={() => setEditingId(editingId === c.id ? null : c.id)}
                  className="rounded-lg border border-stone-300 px-3 py-1 text-xs text-stone-600"
                >
                  {editingId === c.id ? "Close" : "Edit"}
                </button>
                <DeleteButton path="/api/class-types" id={c.id} label={c.name} onRun={onRun} />
              </div>
            </div>
            {editingId === c.id && (
              <ClassTypeEditRow classType={c} onRun={onRun} onDone={() => setEditingId(null)} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-stone-100 pt-3">
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
        <input placeholder="Price GHS" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={`w-28 ${input}`} />
        <input placeholder="Mins" type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className={`w-20 ${input}`} />
        <input placeholder="Capacity" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className={`w-24 ${input}`} />
        <textarea
          placeholder="Description — what it is, who it's for, what to bring"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          className={`w-full ${input}`}
        />
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
                  description: form.description,
                }),
              "Class type created.",
            ).then((err) => {
              if (!err) setForm({ name: "", price: "", duration: "55", capacity: "8", description: "" });
            })
          }
        >
          Add
        </button>
      </div>
    </section>
  );
}

function ClassTypeEditRow({ classType, onRun, onDone }: {
  classType: ClassType; onRun: (a: () => Promise<string | null>, ok: string) => Promise<string | null>; onDone: () => void;
}) {
  const [form, setForm] = useState({
    name: classType.name,
    price: String(classType.priceGHS / 100),
    duration: String(classType.durationMins),
    capacity: String(classType.defaultCapacity),
    description: classType.description,
  });
  return (
    <div className="mt-2 flex flex-wrap items-start gap-2 rounded-lg bg-stone-50 p-3 text-xs">
      <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
      <input placeholder="Price GHS" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={`w-28 ${input}`} />
      <input placeholder="Mins" type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className={`w-20 ${input}`} />
      <input placeholder="Capacity" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className={`w-24 ${input}`} />
      <textarea
        placeholder="Description"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        rows={2}
        className={`w-full ${input}`}
      />
      <button
        className={btn}
        onClick={() =>
          onRun(
            () =>
              api("/api/class-types", "PATCH", {
                id: classType.id,
                name: form.name,
                priceGHS: parseGHS(form.price),
                durationMins: Number(form.duration),
                defaultCapacity: Number(form.capacity),
                description: form.description,
              }),
            "Class type updated.",
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

/** One-time session bundles scoped to a single class type (e.g. "Thai
 *  Massage 90min — Buy 7 Get 1"), separate from recurring Plans — no
 *  auto-renewal, no freeze, just N sessions that expire after validDays. */
function PackagesSection({ packages, classTypes, perks, onRun }: {
  packages: Package[]; classTypes: ClassType[]; perks: Perk[];
  onRun: (a: () => Promise<string | null>, ok: string) => Promise<string | null>;
}) {
  const [form, setForm] = useState({
    name: "", classTypeId: classTypes[0]?.id ?? "", sessions: "8", price: "", validDays: "90", perkIds: [] as string[],
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  function togglePerk(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((p) => p !== id) : [...list, id];
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-stone-700">Packages</h2>
      <p className="mt-1 text-xs text-stone-400">
        One-time session bundles for a single service — e.g. a Thai massage 8-session pack, or a
        trainer-locked Pilates bundle (scope it to that trainer&apos;s class type). No auto-renewal;
        unused sessions just expire.
      </p>
      <div className="mt-3 divide-y divide-stone-100">
        {packages.map((p) => (
          <div key={p.id} className="py-2 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-stone-800">{p.name}</p>
                <p className="text-stone-600">
                  {p.classType.name} · {p.sessionsGranted} sessions · {formatGHS(p.priceGHS)} · {p.validDays}d
                  {p.perks.length > 0 && ` · ${p.perks.map((pk) => pk.name).join(", ")}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onRun(() => api("/api/packages", "PATCH", { id: p.id, active: !p.active }), "Package updated.")}
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
                <DeleteButton path="/api/packages" id={p.id} label={p.name} onRun={onRun} />
              </div>
            </div>
            {editingId === p.id && (
              <PackageEditRow pkg={p} perks={perks} onRun={onRun} onDone={() => setEditingId(null)} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-stone-100 pt-3">
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
        <select value={form.classTypeId} onChange={(e) => setForm({ ...form, classTypeId: e.target.value })} className={`bg-white ${input}`}>
          {classTypes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input placeholder="Sessions" type="number" value={form.sessions} onChange={(e) => setForm({ ...form, sessions: e.target.value })} className={`w-24 ${input}`} />
        <input placeholder="Price GHS" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={`w-28 ${input}`} />
        <input placeholder="Valid days" type="number" value={form.validDays} onChange={(e) => setForm({ ...form, validDays: e.target.value })} className={`w-28 ${input}`} />
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
          disabled={!form.name || !form.classTypeId || !form.price}
          className={btn}
          onClick={() =>
            onRun(
              () =>
                api("/api/packages", "POST", {
                  name: form.name,
                  classTypeId: form.classTypeId,
                  sessionsGranted: Number(form.sessions),
                  priceGHS: parseGHS(form.price),
                  validDays: Number(form.validDays),
                  perkIds: form.perkIds,
                }),
              "Package created.",
            )
          }
        >
          Add
        </button>
      </div>
    </section>
  );
}

function PackageEditRow({ pkg, perks, onRun, onDone }: {
  pkg: Package; perks: Perk[]; onRun: (a: () => Promise<string | null>, ok: string) => Promise<string | null>; onDone: () => void;
}) {
  const [sessions, setSessions] = useState(String(pkg.sessionsGranted));
  const [price, setPrice] = useState(String(pkg.priceGHS / 100));
  const [validDays, setValidDays] = useState(String(pkg.validDays));
  const [perkIds, setPerkIds] = useState(pkg.perks.map((p) => p.id));

  function togglePerk(id: string) {
    setPerkIds((list) => (list.includes(id) ? list.filter((p) => p !== id) : [...list, id]));
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 p-3 text-xs">
      <label className="flex items-center gap-1">
        Sessions
        <input type="number" value={sessions} onChange={(e) => setSessions(e.target.value)} className={`w-20 ${input}`} />
      </label>
      <label className="flex items-center gap-1">
        Price GHS
        <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={`w-24 ${input}`} />
      </label>
      <label className="flex items-center gap-1">
        Valid days
        <input type="number" value={validDays} onChange={(e) => setValidDays(e.target.value)} className={`w-20 ${input}`} />
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
              api("/api/packages", "PATCH", {
                id: pkg.id,
                sessionsGranted: Number(sessions),
                priceGHS: parseGHS(price),
                validDays: Number(validDays),
                perkIds,
              }),
            "Package updated.",
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

function StaffSection({ isOwner, onRun }: { isOwner: boolean; onRun: (a: () => Promise<string | null>, ok: string) => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: isOwner ? "ADMIN" : "ACCOUNTANT", password: "" });
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-stone-700">Add staff</h2>
      <p className="mt-1 text-xs text-stone-400">
        Set a password and share it with them. They change it at <code>/set-password</code> before their first real login.
        Trainers get a blank profile — set their specialty, commission and PT rate on the Trainers page.
        Accountants manage payroll, payouts, social security and tax payments.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} />
        <input type="password" placeholder="Password (8+ chars)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={input} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={`bg-white ${input}`}>
          <option value="TRAINER">Trainer</option>
          <option value="ACCOUNTANT">Accountant</option>
          {isOwner && <option value="ADMIN">Admin</option>}
          {isOwner && <option value="OWNER">Owner</option>}
        </select>
        <button
          disabled={!form.name || !form.email || !form.phone || form.password.length < 8}
          className={btn}
          onClick={() =>
            onRun(
              () => api("/api/staff", "POST", form).then((e) => { if (!e) setForm({ ...form, password: "" }); return e; }),
              "Staff account created.",
            )
          }
        >
          Add
        </button>
      </div>
    </section>
  );
}
