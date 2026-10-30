"use client";

import { formatMoney, useHydrated } from "@vsolve/ui";

import { RemoteImage } from "@/components/remote-image";
import { useCustomerCoins } from "@/features/coins/queries";
import { useCustomerSession } from "@/features/session/queries";

/**
 * The one offer the platform actually honours at checkout: paying part of a booking with
 * V Coins, capped by the active burn policy.
 *
 * Shaped like a marketplace "10% off" card, but every number is the server's — the cap from
 * `active_burn_policy`, the balance from `spendable_coins`, their rupee value from
 * `coin_value_paise`. A guest, a customer with no spendable coins, or a platform with no
 * active policy sees nothing: an offer card with nothing behind it is a promise checkout
 * would then break.
 *
 * The picture is the category's own 3D icon from the catalogue, so the card matches the
 * tiles a customer has just come through.
 */
export function ServiceOfferBanner({ imageUrl }: { imageUrl: string }) {
  const hydrated = useHydrated();
  const session = useCustomerSession();
  const signedIn = hydrated && session.isAuthenticated;
  const coins = useCustomerCoins({ enabled: signedIn });

  const summary = signedIn ? coins.data : undefined;
  const policy = summary?.active_burn_policy;
  const coinValuePaise = policy?.coin_value_paise;
  const maxBurnPercent = policy?.max_burn_percent;
  if (
    !summary ||
    coinValuePaise === undefined ||
    maxBurnPercent === undefined ||
    summary.spendable_coins <= 0
  ) {
    return null;
  }

  const worthPaise = summary.spendable_coins * coinValuePaise;

  return (
    <section
      aria-label="Offer"
      className="mt-6 flex items-center justify-between gap-4 overflow-hidden rounded-[1rem] border border-[#CFE8D8] bg-[#F1F9F4] p-5 sm:p-6"
    >
      <div className="min-w-0">
        <p className="text-[0.7rem] font-bold uppercase tracking-wider text-[#137333]">V Coins</p>
        <h2 className="mt-1 text-[1.25rem] font-bold leading-snug text-navy-900 sm:text-[1.4rem]">
          Pay up to {maxBurnPercent}% of this booking with V Coins
        </h2>
        <p className="mt-2 text-[0.9rem] text-text-secondary">
          You have{" "}
          <span className="font-semibold text-navy-900 tabular-nums">
            {summary.spendable_coins.toLocaleString("en-IN")} coins
          </span>{" "}
          worth {formatMoney(worthPaise)}. Choose to use them at payment.
        </p>
      </div>
      {imageUrl !== "" ? (
        <RemoteImage
          src={imageUrl}
          alt=""
          width={96}
          height={96}
          className="size-20 shrink-0 object-contain sm:size-24"
        />
      ) : null}
    </section>
  );
}
