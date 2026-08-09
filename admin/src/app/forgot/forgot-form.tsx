"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ForgotForm() {
  const router = useRouter();
  const [step, setStep] = useState<"PHONE" | "RESET">("PHONE");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input = "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none";

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "SEND", phone, purpose: "RESET_PASSWORD" }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not send code");
      return;
    }
    setStep("RESET");
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code, newPassword: password }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Reset failed");
      return;
    }
    router.push("/login");
  }

  if (step === "RESET") {
    return (
      <form onSubmit={reset} className="space-y-3">
        <p className="text-sm text-stone-600">If that number has an account, a code is on its way.</p>
        <input required placeholder="6-digit code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className={input} />
        <input required type="password" placeholder="New password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-stone-900 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Resetting…" : "Set new password"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="space-y-3">
      <input required placeholder="Phone (+233…)" value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-stone-900 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "Sending…" : "Send code"}
      </button>
    </form>
  );
}
