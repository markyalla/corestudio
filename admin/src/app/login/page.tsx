import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in — P4Studio" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-stone-900">P4Studio</h1>
        <p className="mb-6 text-sm text-stone-500">Log in to your account</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
