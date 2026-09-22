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

type SessionOpt = { id: string; startsAt: string; className: string };

export function RequestForm({ sessions }: { sessions: SessionOpt[] }) {
  const router = useRouter();
  const [type, setType] = useState<"CANCEL_SESSION" | "UNAVAILABLE">("CANCEL_SESSION");
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    const err = await api("/api/trainer-requests", "POST", {
      type,
      sessionId: type === "CANCEL_SESSION" ? sessionId : undefined,
      message,
    });
    setBusy(false);
    if (err) return setError(err);
    setMessage("");
    router.refresh();
  }

  const canSubmit = message.trim().length > 0 && (type === "UNAVAILABLE" || !!sessionId);

  return (
    <div className="space-y-3 text-sm">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as "CANCEL_SESSION" | "UNAVAILABLE")}
        className="w-full rounded-lg border border-stone-300 px-3 py-2"
      >
        <option value="CANCEL_SESSION">Cancel a class</option>
        <option value="UNAVAILABLE">I won&apos;t be available</option>
      </select>

      {type === "CANCEL_SESSION" && (
        sessions.length === 0 ? (
          <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
            You have no upcoming classes to cancel.
          </p>
        ) : (
          <select
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.className} · {new Date(s.startsAt).toISOString().slice(0, 16).replace("T", " ")}
              </option>
            ))}
          </select>
        )
      )}

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={
          type === "CANCEL_SESSION"
            ? "Why should this class be cancelled?"
            : "When won't you be available, and why?"
        }
        rows={3}
        className="w-full rounded-lg border border-stone-300 px-3 py-2"
      />

      {error && <p className="text-red-600">{error}</p>}

      <button
        onClick={submit}
        disabled={!canSubmit || busy || (type === "CANCEL_SESSION" && sessions.length === 0)}
        className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send to staff"}
      </button>
    </div>
  );
}
