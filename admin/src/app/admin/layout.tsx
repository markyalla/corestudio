import Link from "next/link";
import { auth } from "@/auth";
import { SignOutButton } from "./sign-out-button";

const NAV = [
  { href: "/admin", label: "Dashboard", roles: ["OWNER", "ADMIN", "ACCOUNTANT"] },
  { href: "/admin/timetable", label: "Timetable", roles: ["OWNER", "ADMIN", "TRAINER"] },
  { href: "/admin/bookings", label: "Bookings", roles: ["OWNER", "ADMIN"] },
  { href: "/admin/members", label: "Members", roles: ["OWNER", "ADMIN"] },
  { href: "/admin/trainers", label: "Trainers", roles: ["OWNER", "ADMIN"] },
  { href: "/admin/payments", label: "Payments", roles: ["OWNER", "ADMIN", "ACCOUNTANT"] },
  { href: "/admin/payouts", label: "Payouts", roles: ["OWNER", "ADMIN", "ACCOUNTANT"] },
  { href: "/admin/payroll", label: "Payroll", roles: ["OWNER", "ADMIN", "ACCOUNTANT"] },
  { href: "/admin/tax", label: "Tax & Social Security", roles: ["OWNER", "ADMIN", "ACCOUNTANT"] },
  { href: "/admin/my-earnings", label: "My earnings", roles: ["TRAINER"] },
  { href: "/admin/requests", label: "Requests", roles: ["TRAINER"] },
  { href: "/admin/trainer-requests", label: "Trainer requests", roles: ["OWNER", "ADMIN"] },
  { href: "/admin/reports", label: "Reports", roles: ["OWNER", "ADMIN", "ACCOUNTANT"] },
  { href: "/admin/audit", label: "Audit Log", roles: ["OWNER", "ADMIN"] },
  { href: "/admin/settings", label: "Settings", roles: ["OWNER", "ADMIN"] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = session?.user?.role ?? "MEMBER";
  const items = NAV.filter((n) => n.roles.includes(role));

  return (
    <div className="h-screen overflow-hidden bg-stone-100">
      <aside className="fixed inset-y-0 left-0 flex w-56 flex-col overflow-y-auto border-r border-stone-200 bg-white">
        <div className="px-5 py-5">
          <p className="text-lg font-semibold text-stone-900">CoreStudio</p>
          <p className="text-xs text-stone-400">Staff portal</p>
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
              className="block rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-stone-200 p-4 text-xs text-stone-500">
          <p className="font-medium text-stone-700">{session?.user?.name}</p>
          <p>{role}</p>
          <SignOutButton />
        </div>
      </aside>
      <div className="ml-56 h-full min-w-0 overflow-y-auto">{children}</div>
    </div>
  );
}
