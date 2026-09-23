import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Set your password — P4Studio" };

export default function SetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-stone-900">Set your password</h1>
        <p className="mb-6 text-sm text-stone-500">
          Enter the password you were given, then choose a new one.
        </p>
        <SetPasswordForm />
      </div>
    </main>
  );
}
