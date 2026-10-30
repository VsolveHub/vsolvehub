"use client";

import { Badge , formatDate} from "@vsolve/ui";
import { Gift, Users } from "lucide-react";
import { holdExplanation, referralRewardLine } from "../model";
import type { ReferralAttribution } from "../queries";

interface ReferralAttributionsListProps {
  attributions: ReferralAttribution[];
  /** Days a reward waits after the friend's booking; explained under the list. */
  holdDays: number;
}

function getReferralStatusMeta(attr: ReferralAttribution) {
  switch (attr.status) {
    case "REWARDED":
      return {
        label: "Reward added",
        tone: "success" as const,
        description: "Your reward has been added",
      };
    case "QUALIFIED":
      return {
        label: "Reward on the way",
        tone: "info" as const,
        description: attr.reward_available_at
          ? `Booked · reward on ${formatDate(attr.reward_available_at)}`
          : "Booked · reward coming soon",
      };
    case "INELIGIBLE":
      return {
        label: "Not eligible",
        tone: "neutral" as const,
        description: "This referral did not qualify",
      };
    case "REVERSED":
      return {
        label: "Reversed",
        tone: "neutral" as const,
        description: "This reward was withdrawn",
      };
    case "PENDING":
    default:
      return {
        label: "Waiting for booking",
        tone: "warning" as const,
        description: "Joined · no completed booking yet",
      };
  }
}

export function ReferralAttributionsList({ attributions, holdDays }: ReferralAttributionsListProps) {
  if (attributions.length === 0) {
    return (
      <div className="rounded-card border border-[#e7e2da] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">
          <Users className="size-6" />
        </div>
        <h3 className="mt-3 text-sm font-bold text-navy-900">No invited friends yet</h3>
        <p className="mt-1 text-xs text-text-secondary max-w-sm mx-auto">
          Share your referral link on WhatsApp or social media. When friends sign up, they will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-[#e7e2da] bg-white shadow-sm overflow-hidden">
      <div className="border-b border-[#eee9e0] px-6 py-4">
        <h2 className="text-base font-bold text-navy-900">Referred Friends History</h2>
      </div>

      <div className="divide-y divide-[#eee9e0]">
        {attributions.map((attr) => {
          const meta = getReferralStatusMeta(attr);
          const reward = referralRewardLine(attr);
          const formattedDate = formatDate(attr.attributed_at || "");

          return (
            <div
              key={attr.id}
              className="flex items-center justify-between px-6 py-4 hover:bg-[#FAF9F7]/60 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-orange-50 text-[#EA580C]">
                  <Gift className="size-4.5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-navy-900">
                      {attr.referee_display || "Friend"}
                    </span>
                    <Badge tone={meta.tone} className="text-[10px] py-0">
                      {meta.label}
                    </Badge>
                  </div>
                  <span className="block text-xs text-text-muted mt-0.5">
                    Invited on {formattedDate} • {meta.description}
                  </span>
                  {reward ? (
                    <span
                      className={`mt-1 block text-xs font-semibold ${
                        attr.status === "REWARDED" ? "text-emerald-700" : "text-navy-900"
                      }`}
                    >
                      {attr.status === "REWARDED" ? "You got " : "You get "}
                      {reward}
                      {attr.reward_is_estimate && attr.status !== "REWARDED" ? " *" : ""}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="border-t border-[#eee9e0] px-6 py-3 text-[11px] text-text-secondary">
        {holdExplanation(holdDays)} * Amounts on the way follow your reward tier when they are paid.
      </p>
    </div>
  );
}
