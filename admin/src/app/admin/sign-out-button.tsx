"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="mt-1 inline-block text-stone-400 underline"
    >
      Sign out
    </button>
  );
}
