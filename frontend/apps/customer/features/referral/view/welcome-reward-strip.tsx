"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Gift, X } from "lucide-react";

import { useCustomerSession } from "@/features/session/queries";

import { rewardLabel } from "../model";
import { useCustomerReferral } from "../queries";

const DISMISS_KEY = "vsolve.welcome-reward-strip.dismissed";

/** Where somebody is choosing what to book: home, the catalogue and a service's booking page. */
export function isBrowsingPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/catalog") ||
    pathname.startsWith("/book/")
  );
}

/**
 * The welcome reward a new customer is still owed, kept in view while they browse, because the
 * reward is the reason to make that first booking. Only while it waits on a booking (`PENDING`);
 * once booked, the wallet and referral screens say when it lands. Dismissed for the tab session.
 */
export function WelcomeRewardStrip() {
  const session = useCustomerSession();
  const signedIn = !session.isResolving && session.isAuthenticated;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!signedIn || dismissed) return null;
  return (
    <PendingRewardStrip
      onDismiss={() => {
        setDismissed(true);
        try {
          sessionStorage.setItem(DISMISS_KEY, "1");
        } catch {
          // Storage blocked: it stays hidden until the next page load.
        }
      }}
    />
  );
}

// Split out so the referral summary is only requested for a signed-in customer.
function PendingRewardStrip({ onDismiss }: { onDismiss: () => void }) {
  const referral = useCustomerReferral();
  const welcome = referral.data?.welcome_reward;
  const amount =
    welcome?.status === "PENDING"
      ? rewardLabel(welcome.wallet_paise, welcome.coins)
      : "";
  if (!amount) return null;

  return (
    <div
      role="status"
      className="mx-4 mt-3 flex items-center gap-3 rounded-card border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-navy-900 md:mx-auto md:max-w-6xl"
    >
      <Gift className="size-5 shrink-0 text-[#EA580C]" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">
          Your {amount} welcome reward is waiting.
        </span>{" "}
        <span className="text-text-secondary">
          Complete your first booking to get it.
        </span>
      </p>
      <Link
        href="/catalog"
        className="hidden shrink-0 rounded-control bg-[#EA580C] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#C2410C] sm:inline-flex"
      >
        Book a service
      </Link>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Hide welcome reward"
        className="grid size-8 shrink-0 place-items-center rounded-full text-text-secondary hover:bg-orange-100"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
