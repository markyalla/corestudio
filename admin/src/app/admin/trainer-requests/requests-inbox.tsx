"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

type RequestRow = {
  id: string;
  type: "CANCEL_SESSION" | "UNAVAILABLE";
  message: string;
  status: "PENDING" | "APPROVED" | "DISMISSED";
  createdAt: string;
  trainer: { user: { name: string } };
  session: { id: string; startsAt: string; status: string; classType: { name: string } | null } | null;
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-red-50 text-red-700",
  DISMISSED: "bg-stone-100 text-stone-500",
};

export function RequestsInbox({ requests }: { requests: RequestRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: string, action: "CANCEL_SESSION" | "DISMISS", mode?: "REFUND" | "RESCHEDULE") {
    if (action === "CANCEL_SESSION") {
      const msg =
        mode === "REFUND"
          ? "Cancel this class and refund every member who booked it (credit back, or cash back to their wallet)?"
          : "Cancel this class and give every member who booked it a free class credit to rebook another time (no cash refund)?";
      if (!confirm(msg)) return;
    }
    setError(null);
    setBusyId(id);
    const err = await api(`/api/trainer-requests/${id}`, "PATCH", { action, mode });
    setBusyId(null);
    if (err) return setError(err);
    router.refresh();
  }

  if (requests.length === 0) {
    return <p className="text-sm text-stone-400">No requests yet.</p>;
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {requests.map((r) => (
        <div key={r.id} className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-stone-900">
                {r.trainer.user.name} · {r.type === "CANCEL_SESSION" ? "Cancel a class" : "Won't be available"}
              </p>
              {r.session && (
                <p className="mt-0.5 text-sm text-stone-500">
                  {r.session.classType?.name ?? "Private class"} ·{" "}
                  {new Date(r.session.startsAt).toISOString().slice(0, 16).replace("T", " ")}
                  {r.session.status === "CANCELLED" && " (already cancelled)"}
                </p>
              )}
              <p className="mt-2 text-sm text-stone-700">{r.message}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
              {r.status}
            </span>
          </div>

          {r.status === "PENDING" && (
            <div className="mt-4 flex gap-2 border-t border-stone-100 pt-4">
              {r.type === "CANCEL_SESSION" && r.session && r.session.status === "SCHEDULED" && (
                <>
                  <button
                    onClick={() => resolve(r.id, "CANCEL_SESSION", "REFUND")}
                    disabled={busyId === r.id}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Cancel &amp; refund
                  </button>
                  <button
                    onClick={() => resolve(r.id, "CANCEL_SESSION", "RESCHEDULE")}
                    disabled={busyId === r.id}
                    className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Cancel &amp; reschedule
                  </button>
                </>
              )}
              <button
                onClick={() => resolve(r.id, "DISMISS")}
                disabled={busyId === r.id}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-600 disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
