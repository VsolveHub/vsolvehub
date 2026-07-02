"use client";

import { useState } from "react";
import { ClipboardList, ScrollText, ShieldCheck, LogOut, Menu, X } from "lucide-react";
import { Logo } from "@vsolve/ui";
import { logout } from "@/lib/auth-actions";
import { NavLink } from "./nav-link";
import type { CurrentAdmin } from "@/lib/auth";

function NavItems({ admin, onNavigate }: { admin: CurrentAdmin; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1">
      <NavLink href="/partners" icon={<ClipboardList className="h-4 w-4" />} onClick={onNavigate}>
        Partners
      </NavLink>
      <NavLink href="/audit" icon={<ScrollText className="h-4 w-4" />} onClick={onNavigate}>
        Audit log
      </NavLink>
      {admin.role === "ADMIN" ? (
        <NavLink href="/admins" icon={<ShieldCheck className="h-4 w-4" />} onClick={onNavigate}>
          Admins
        </NavLink>
      ) : null}
    </nav>
  );
}

function UserFooter({ admin }: { admin: CurrentAdmin }) {
  return (
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
  );
}

export function Sidebar({ admin }: { admin: CurrentAdmin }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop: fixed left rail */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-ink-900 px-4 py-6 lg:flex">
        <div className="px-2">
          <Logo dark />
          <p className="mt-0.5 pl-8 text-xs font-semibold uppercase tracking-wide text-white/40">
            Admin
          </p>
        </div>
        <div className="mt-8 flex flex-1 flex-col">
          <NavItems admin={admin} />
          <UserFooter admin={admin} />
        </div>
      </aside>

      {/* Mobile: top bar with hamburger */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-ink-900 px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <Logo dark />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Admin</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-2 text-white/80 hover:bg-white/10"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile: slide-in drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[82%] flex-col bg-ink-900 px-4 py-6 shadow-xl">
            <div className="flex items-center justify-between px-2">
              <Logo dark />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-8 flex flex-1 flex-col">
              <NavItems admin={admin} onNavigate={() => setOpen(false)} />
              <UserFooter admin={admin} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
