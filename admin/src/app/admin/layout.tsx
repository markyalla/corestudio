import { auth } from "@/auth";
import { AdminNav } from "./admin-nav";

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
    <div className="min-h-screen bg-stone-100 lg:h-screen lg:overflow-hidden">
      <AdminNav items={items} userName={session?.user?.name} role={role} />
      <div className="min-w-0 lg:ml-56 lg:h-full lg:overflow-y-auto">{children}</div>
    </div>
  );
}
