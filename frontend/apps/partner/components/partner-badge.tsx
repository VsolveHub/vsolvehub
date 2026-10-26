"use client";

import { useCurrentSession, hasRole } from "@vsolve/query";
import { getApiClient } from "@/lib/api/browser";
import { PARTNER_ROLE } from "@/features/session/partner-shell";
import { usePartnerProfile } from "@/features/profile/queries";

/**
 * Dynamic Brand Badge:
 * Displays the verified "PRO" pill badge only when the backend session or partner profile
 * confirms the partner is an approved Professional (`isPartner` or `approval_status === "APPROVED"`).
 * Displays "Partner" for applicants and visitors.
 */
export function PartnerBadge({ className = "" }: { className?: string }) {
  const session = useCurrentSession(getApiClient());
  // Only someone holding the role can read a profile; asking for anyone else
  // is a guaranteed 403.
  const profile = usePartnerProfile({
    enabled: Boolean(session.data?.user && hasRole(session.data.user, PARTNER_ROLE)),
  });

  const isPro =
    Boolean(session.data?.user && hasRole(session.data.user, PARTNER_ROLE)) ||
    profile.data?.approval_status === "APPROVED";

  if (isPro) {
    return (
      <div
        className={`flex items-center gap-1.5 rounded-full bg-navy-50 px-2 py-0.5 border border-navy-200 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-navy-900 ${className}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-signal-500 animate-pulse" />
        <span>PRO</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 border border-line text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-text-secondary ${className}`}
    >
      <span>Partner</span>
    </div>
  );
}
