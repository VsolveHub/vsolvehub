import { ShieldOff } from "lucide-react";
import { Logo } from "@vsolve/ui";
import { createClient } from "@/utils/supabase/server";
import { logout } from "@/lib/auth-actions";

export const metadata = { title: "Access denied" };

export default async function AccessDeniedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-5">
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-border bg-white p-8 text-center shadow-sm">
        <Logo className="justify-center" />
        <ShieldOff className="mx-auto mt-6 h-10 w-10 text-danger" />
        <h1 className="mt-4 text-xl font-bold text-ink-900">Access denied</h1>
        <p className="mt-2 text-sm text-gray-500">
          {user?.email ? <>{user.email} isn&apos;t</> : "This account isn't"} on the VSolveHub
          admin allowlist. Ask an existing admin to add you.
        </p>
        <form action={logout} className="mt-6">
          <button
            type="submit"
            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Sign out and try another email
          </button>
        </form>
      </div>
    </div>
  );
}
