import { redirect } from "next/navigation";
import { Logo } from "@vsolve/ui";
import { getCurrentAdmin } from "@/lib/auth";
import { EmailForm } from "./email-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (admin) redirect("/partners");
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-5">
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-border bg-white p-8 shadow-sm">
        <Logo />
        <h1 className="mt-6 text-2xl font-bold text-ink-900">Admin sign in</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enter your email and we&apos;ll send you a one-time sign-in link.
        </p>
        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
            That link expired or was already used. Request a new one below.
          </p>
        ) : null}
        <EmailForm />
      </div>
    </div>
  );
}
