"use client";

import Link from "next/link";
import { useHydrated } from "@vsolve/ui";
import { useCurrentSession, hasRole } from "@vsolve/query";
import { getApiClient } from "@/lib/api/browser";
import { PARTNER_ROLE } from "@/features/session/partner-shell";
import { usePartnerProfile } from "@/features/profile/queries";
import { usePartnerApplication } from "@/features/application/queries";

/** Logged-out CTA — also the SSR/first-paint fallback so hydration matches. */
function GuestMarketingNavCta() {
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        className="hidden sm:inline-flex min-h-11 items-center whitespace-nowrap px-3.5 py-1.5 text-xs font-bold text-navy-900 hover:text-signal-600 rounded-full hover:bg-surface-sunken transition-colors"
      >
        Sign In
      </Link>
      <Link
        href="/apply"
        className="group relative inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-r from-signal-500 via-amber-500 to-signal-400 px-4 sm:px-5 py-1.5 sm:py-2 text-xs font-extrabold text-[#00112e] shadow-md shadow-signal-500/30 hover:from-signal-400 hover:to-amber-300 transition-all hover:scale-[1.03] active:scale-[0.98]"
      >
        <span className="hidden sm:inline">Become a Partner</span>
        <span className="sm:hidden">Join</span>
      </Link>
    </div>
  );
}

export function MarketingNavCta() {
  const hydrated = useHydrated();

  const session = useCurrentSession(getApiClient(), { enabled: hydrated });
  // Only someone holding the role can read a profile; asking for anyone else
  // is a guaranteed 403.
  const profile = usePartnerProfile({
    enabled: Boolean(session.data?.user && hasRole(session.data.user, PARTNER_ROLE)),
  });
  const application = usePartnerApplication({ enabled: hydrated && Boolean(session.data?.user) });

  if (!hydrated || session.isPending) {
    return <GuestMarketingNavCta />;
  }

  const isApprovedPartner =
    Boolean(session.data?.user && hasRole(session.data.user, PARTNER_ROLE)) ||
    application.data?.status === "APPROVED" ||
    profile.data?.approval_status === "APPROVED";

  const isLoggedIn = Boolean(session.data?.user);

  if (isApprovedPartner) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/home"
          className="group relative inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-600 px-4 sm:px-5 py-1.5 sm:py-2 text-xs font-extrabold text-white shadow-md shadow-emerald-600/30 hover:bg-emerald-500 transition-all hover:scale-[1.03] active:scale-[0.98]"
        >
          <span>Open Partner App</span>
        </Link>
      </div>
    );
  }

  if (isLoggedIn) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/apply"
          className="group relative inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-r from-signal-500 via-amber-500 to-signal-400 px-4 sm:px-5 py-1.5 sm:py-2 text-xs font-extrabold text-[#00112e] shadow-md shadow-signal-500/30 hover:from-signal-400 hover:to-amber-300 transition-all hover:scale-[1.03] active:scale-[0.98]"
        >
          <span>Application Dashboard</span>
        </Link>
      </div>
    );
  }

  return <GuestMarketingNavCta />;
}
