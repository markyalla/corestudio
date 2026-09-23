import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Reset password — P4Studio" };

export default function ForgotPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-stone-900">Reset password</h1>
        <p className="mb-6 text-sm text-stone-500">We&apos;ll text a code to your phone</p>
        <ForgotForm />
      </div>
    </main>
  );
}
