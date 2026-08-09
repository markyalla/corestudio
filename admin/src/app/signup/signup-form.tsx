"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function SignupForm() {
  const router = useRouter();
  const [step, setStep] = useState<"FORM" | "OTP">("FORM");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Sign-up failed");
      return;
    }
    setStep("OTP");
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "VERIFY", phone: form.phone, purpose: "VERIFY_PHONE", code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setError(data.error ?? "Verification failed");
      return;
    }
    // Verified — account created. Members use the mobile app from here;
    // there's no member web destination to sign them into.
    setBusy(false);
    router.push("/login");
    router.refresh();
  }

  const input = "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none";

  if (step === "OTP") {
    return (
      <form onSubmit={submitOtp} className="space-y-4">
        <p className="text-sm text-stone-600">
          We sent a 6-digit code to <span className="font-medium">{form.phone}</span>.
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="123456"
          inputMode="numeric"
          className={`${input} text-center text-lg tracking-[0.4em]`}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="w-full rounded-lg bg-stone-900 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Verifying…" : "Verify and continue"}
        </button>
        <button
          type="button"
          onClick={() =>
            fetch("/api/otp", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "SEND", phone: form.phone, purpose: "VERIFY_PHONE" }),
            })
          }
          className="w-full text-center text-xs text-stone-400 underline"
        >
          Resend code
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitForm} className="space-y-3">
      <input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
      <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
      <input required placeholder="Phone (+233…)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} />
      <input required type="password" placeholder="Password (8+ characters)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={input} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-stone-900 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "Creating…" : "Create account"}
      </button>
      <p className="text-center text-xs text-stone-400">
        Already a member?{" "}
        <Link href="/login" className="underline">Log in</Link>
      </p>
    </form>
  );
}
