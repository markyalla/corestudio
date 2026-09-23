import { redirect } from "next/navigation";
import { prisma } from "@backend/lib/prisma";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Set up your studio — P4Studio" };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  // One-time bootstrap: available only until the first OWNER exists.
  const ownerCount = await prisma.user.count({ where: { role: "OWNER" } });
  if (ownerCount > 0) redirect("/login");

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-stone-900">Set up your studio</h1>
        <p className="mb-6 text-sm text-stone-500">Create the owner account — you can add admins and trainers next.</p>
        <SignupForm />
      </div>
    </main>
  );
}
