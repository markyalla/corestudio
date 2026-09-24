"use client";

import { useState } from "react";
import Link from "next/link";
import { SignOutButton } from "./sign-out-button";

interface NavItem {
  href: string;
  label: string;
}

/** Sidebar nav + mobile top bar. Client component because the off-canvas
 *  drawer on small screens needs open/close state — the surrounding layout
 *  stays a server component so it can keep reading the session directly. */
export function AdminNav({
  items,
  userName,
  role,
}: {
  items: NavItem[];
  userName?: string | null;
  role: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 lg:hidden">
        <p className="text-lg font-semibold text-stone-900">P4Studio</p>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-2 text-stone-600 hover:bg-stone-100"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
          </svg>
        </button>
      </div>

      {open && (
        <button
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[80vw] flex-col overflow-y-auto border-r border-stone-200 bg-white transition-transform duration-200 lg:z-auto lg:w-56 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between px-5 py-5">
          <div>
            <p className="text-lg font-semibold text-stone-900">P4Studio</p>
            <p className="text-xs text-stone-400">{userName}</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 lg:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              // Prefetch off: these are auth-gated RSC fetches, and a
              // prefetch response landing after sign-out's cookie-clear
              // carries its own session-refresh Set-Cookie, silently
              // reviving the session that was just cleared.
              prefetch={false}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-stone-200 p-4 text-xs text-stone-500">
          <p className="font-medium text-stone-700">{userName}</p>
          <p>{role}</p>
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}
