import Link from "next/link";
import { ArrowLeft, LogOut, BadgeCheck } from "lucide-react";
import { logout } from "@/app/live/actions";

/**
 * Mobile-first chrome for the captain's secondary pages (documents, skills,
 * vehicle, settings, support). These are reached from the Profile tab of the
 * live app at /live — so the chrome is a simple back-bar, not a desktop sidebar.
 */
export function DashboardChrome({
  name,
  verified,
  children,
}: {
  name: string;
  verified: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href="/live"
            className="flex items-center gap-2 text-sm font-semibold text-ink-900 hover:text-brand-700"
          >
            <ArrowLeft className="h-5 w-5" /> Back to app
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-sm font-medium text-ink-900 sm:flex">
              {name}
              {verified ? <BadgeCheck className="h-4 w-4 text-green-600" /> : null}
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-500 hover:bg-surface-muted hover:text-ink-900"
                aria-label="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-6">{children}</main>
    </div>
  );
}
