import { ClipboardList, ScrollText, ShieldCheck, LogOut } from "lucide-react";
import { Logo } from "@vsolve/ui";
import { logout } from "@/lib/auth-actions";
import { NavLink } from "./nav-link";
import type { CurrentAdmin } from "@/lib/auth";

export function Sidebar({ admin }: { admin: CurrentAdmin }) {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-ink-900 px-4 py-6">
      <div className="px-2">
        <Logo dark />
        <p className="mt-0.5 pl-8 text-xs font-semibold uppercase tracking-wide text-white/40">
          Admin
        </p>
      </div>

      <nav className="mt-8 flex flex-1 flex-col gap-1">
        <NavLink href="/partners" icon={<ClipboardList className="h-4 w-4" />}>
          Partners
        </NavLink>
        <NavLink href="/audit" icon={<ScrollText className="h-4 w-4" />}>
          Audit log
        </NavLink>
        {admin.role === "ADMIN" ? (
          <NavLink href="/admins" icon={<ShieldCheck className="h-4 w-4" />}>
            Admins
          </NavLink>
        ) : null}
      </nav>

      <div className="border-t border-white/10 pt-4">
        <p className="truncate px-3 text-xs font-medium text-white/60" title={admin.email}>
          {admin.email}
        </p>
        <p className="px-3 text-[11px] uppercase tracking-wide text-white/30">{admin.role}</p>
        <form action={logout} className="mt-2">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
