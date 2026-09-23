"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { PhoneInput } from "@/lib/phone-input";

export function SignupForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input =
    "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/owner-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      const issue = data.issues?.[0]?.message as string | undefined;
      setError(issue ?? data.error ?? "Could not create the owner account");
      return;
    }
    const signInRes = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });
    setBusy(false);
    if (signInRes?.error) {
      router.push("/login");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
      <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
      <PhoneInput onChange={(phone) => setForm({ ...form, phone })} />
      <input required type="password" placeholder="Password (8+ characters)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={input} />
      <input required type="password" placeholder="Confirm password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} className={input} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-stone-900 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "Creating…" : "Create owner account"}
      </button>
      <p className="text-center text-xs text-stone-400">
        Already set up? <Link href="/login" className="underline">Log in</Link>
      </p>
    </form>
  );
}
