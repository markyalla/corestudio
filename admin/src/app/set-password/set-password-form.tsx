"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function SetPasswordForm() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", currentPassword: "", newPassword: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input =
    "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.newPassword !== form.confirm) {
      setError("New passwords don't match");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.email,
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not update the password");
      return;
    }
    router.push("/login?reset=1");
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
      <input required type="password" placeholder="Current password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} className={input} />
      <input required type="password" placeholder="New password (8+ characters)" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} className={input} />
      <input required type="password" placeholder="Confirm new password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} className={input} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-stone-900 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "Updating…" : "Update password"}
      </button>
      <p className="text-center text-xs text-stone-400">
        <Link href="/login" className="underline">Back to log in</Link>
      </p>
    </form>
  );
}
