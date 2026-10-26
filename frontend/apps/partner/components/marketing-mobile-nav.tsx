"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Menu, X, ArrowRight, Phone, Zap } from "lucide-react";
import { Logo } from "@vsolve/ui";
import { HomeHeroLink } from "@/components/home-hero-link";
import { useCurrentSession, hasRole } from "@vsolve/query";
import { getApiClient } from "@/lib/api/browser";
import { PARTNER_ROLE } from "@/features/session/partner-shell";
import { usePartnerProfile } from "@/features/profile/queries";

const DEFAULT_NAV = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/benefits", label: "Earnings & Benefits" },
  { href: "/trades", label: "Trades & Services" },
  { href: "/contact", label: "Support" },
];

/** Hamburger + slide-in drawer for the marketing header on small screens. */
export function MarketingMobileNav({
  items = DEFAULT_NAV,
}: {
  items?: { href: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const session = useCurrentSession(getApiClient());
  // Only someone holding the role can read a profile; asking for anyone else
  // is a guaranteed 403.
  const profile = usePartnerProfile({
    enabled: Boolean(session.data?.user && hasRole(session.data.user, PARTNER_ROLE)),
  });

  const isApprovedPartner =
    Boolean(session.data?.user && hasRole(session.data.user, PARTNER_ROLE)) ||
    profile.data?.approval_status === "APPROVED";

  const isLoggedIn = Boolean(session.data?.user);

  const navItems = items && items.length > 0 ? items : DEFAULT_NAV;

  // Lock background scroll and close on Escape while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);


  const drawer = (
    <div className="fixed inset-0 z-[100] flex justify-end animate-in fade-in duration-200">
      <div
        className="fixed inset-0 bg-navy-950/60 backdrop-blur-xs transition-opacity"
        onClick={close}
        aria-hidden
      />
      <div className="relative z-10 flex h-full w-84 max-w-[min(22rem,88vw)] flex-col bg-white text-navy-900 border-l border-line px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-4">
          <HomeHeroLink onClick={close} className="flex min-h-11 items-center gap-2 group">
            <Logo className="h-6 w-auto" />
          </HomeHeroLink>
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="grid h-11 w-11 sm:h-9 sm:w-9 place-items-center rounded-full bg-surface-sunken text-navy-900 hover:bg-surface border border-line transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Quick Highlights Card */}
        <div className="mt-4 rounded-2xl bg-amber-50/70 p-4 border border-amber-200/70">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
            <Zap className="h-4 w-4 text-signal-500 fill-signal-500" />
            <span>Fast 24h Activation</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-amber-950/80">
            Zero joining fee. Direct bank settlements within 24 hours of job completion.
          </p>
        </div>

        {/* Navigation links */}
        <div className="mt-5 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted px-2 mb-2">
            Explore Menu
          </p>
          <nav className="flex flex-col gap-1">
            {navItems.map((n) => (
              <Link
                key={n.label}
                href={n.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold text-navy-900 hover:bg-surface-sunken transition-colors"
              >
                <span>{n.label}</span>
                <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
              </Link>
            ))}
          </nav>
        </div>

        {/* Action CTAs */}
        <div className="mt-auto space-y-2.5 border-t border-line pt-5">
          {isApprovedPartner ? (
            <>
              <Link href="/home" onClick={close} className="w-full flex items-center justify-center gap-2 rounded-full bg-emerald-600 py-3 text-sm font-extrabold text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-500 transition-all active:scale-[0.99]">
                  <span>Open Partner App</span>
                </Link>
              <Link href="/me" onClick={close} className="block w-full rounded-full bg-surface py-2.5 text-sm font-bold text-navy-900 hover:bg-surface-sunken border border-line-strong transition-colors text-center">
                  My Profile & Settings
                </Link>
            </>
          ) : isLoggedIn ? (
            <>
              <Link href="/apply" onClick={close} className="w-full flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-signal-500 via-amber-500 to-signal-400 py-3 text-sm font-extrabold text-[#00112e] shadow-lg shadow-signal-500/25 hover:from-signal-400 hover:to-amber-300 transition-all active:scale-[0.99]">
                  <span>Application Dashboard</span>
                </Link>
              <Link href="/login" onClick={close} className="block w-full rounded-full bg-surface py-2.5 text-sm font-bold text-navy-900 hover:bg-surface-sunken border border-line-strong transition-colors text-center">
                  Switch Account
                </Link>
            </>
          ) : (
            <>
              <Link href="/apply" onClick={close} className="w-full flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-signal-500 via-amber-500 to-signal-400 py-3 text-sm font-extrabold text-[#00112e] shadow-lg shadow-signal-500/25 hover:from-signal-400 hover:to-amber-300 transition-all active:scale-[0.99]">
                  <span>Become a Partner</span>
                </Link>
              <Link href="/login" onClick={close} className="block w-full rounded-full bg-surface py-2.5 text-sm font-bold text-navy-900 hover:bg-surface-sunken border border-line-strong transition-colors text-center">
                  Sign In to Account
                </Link>
            </>
          )}

          <div className="pt-2 text-center">
            <Link
              href="/contact"
              onClick={close}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-navy-900 transition-colors"
            >
              <Phone className="h-3.5 w-3.5 text-signal-500" />
              <span>Partner Helpline: +91 800 123 4567</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        // 44px: this control only exists below `lg`, so it is only ever
        // pressed with a thumb, and it is the sole route to every marketing
        // destination on a phone.
        className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken text-navy-900 hover:bg-surface border border-line-strong transition-all active:scale-95 shadow-xs"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open ? createPortal(drawer, document.body) : null}
    </div>
  );
}
