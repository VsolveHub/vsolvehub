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
    <div className="flex items-center gap-2 sm:gap-3">
      <Link
        href="/login"
        className="hidden sm:inline-flex items-center whitespace-nowrap px-3 sm:px-4 py-2 text-xs xl:text-[0.8125rem] font-bold text-navy-900 hover:text-signal-600 transition-colors"
      >
        Sign In
      </Link>
      <Link
        href="/apply"
        className="group relative inline-flex items-center justify-center whitespace-nowrap rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 px-5 sm:px-6 py-2 sm:py-2.5 text-xs xl:text-[0.8125rem] font-extrabold text-[#00112e] shadow-md shadow-orange-500/25 hover:from-[#ff7e00] hover:to-[#ff4000] transition-all hover:scale-[1.02] active:scale-[0.98]"
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
      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/home"
          className="group relative inline-flex items-center justify-center whitespace-nowrap rounded-full bg-emerald-600 px-5 sm:px-6 py-2 sm:py-2.5 text-xs xl:text-[0.8125rem] font-extrabold text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-500 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <span>Open Partner App</span>
        </Link>
      </div>
    );
  }

  if (isLoggedIn) {
    return (
      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/apply"
          className="group relative inline-flex items-center justify-center whitespace-nowrap rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 px-5 sm:px-6 py-2 sm:py-2.5 text-xs xl:text-[0.8125rem] font-extrabold text-[#00112e] shadow-md shadow-orange-500/25 hover:from-[#ff7e00] hover:to-[#ff4000] transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <span>Application Dashboard</span>
        </Link>
      </div>
    );
  }

  return <GuestMarketingNavCta />;
}
