import { SignupForm } from "./signup-form";

export const metadata = { title: "Sign up — CoreStudio" };

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-stone-900">Join CoreStudio</h1>
        <p className="mb-6 text-sm text-stone-500">Create your member account</p>
        <SignupForm />
      </div>
    </main>
  );
}
