"use client";

import type { UnlockPhase } from "@vsolve/query";
import { Badge, Button, EmptyState, Skeleton } from "@vsolve/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import type { TeaserView } from "../adapters";
import { AccessRefusal } from "./access-refusal";

/**
 * The A3 door — `M2-FE-401`..`M2-FE-405`.
 *
 * Teasers first, then the charge, and the charge is only ever offered against
 * value the Customer can already see on the same screen. That ordering is the
 * whole commercial model: nothing is charged before a usable quote exists, so
 * "paid but nothing happened" is unreachable rather than merely unlikely.
 *
 * ## The price is never written down in this file
 *
 * `M2-FE-402` calls it "the INR 149 unlock" and this component renders no such
 * number. The price is blocking owner decision 1, read from an effective-dated
 * row that fails closed, and `price_paise` is **null** until Operations loads
 * one. A literal 149 here would be a promise that outlives the policy it
 * describes — and would be wrong on the day the price changes, on every screen
 * at once. When the server has no price, the panel says we cannot offer this
 * yet; it does not guess.
 *
 * ## Why `pending` shows no success and no second button
 *
 * `M2-FE-404`. A provider redirect is a claim made by the party that benefits
 * from it. The only thing that moves an unlock to `ACTIVE` is a verified
 * callback reaching Django, which can land after the tab is closed. So the
 * pending state re-reads (the query polls) and offers nothing to press, because
 * every button that could exist here is a way to be charged twice.
 */

export interface UnlockPanelProps {
  phase: UnlockPhase;
  /** The server's price, already formatted. Null when none is loaded. */
  priceLabel: string | null;
  usableQuoteCount: number;
  teasers: readonly TeaserView[];
  isLoading: boolean;
  /** A failed read of the unlock state or the teasers. */
  readError: unknown;
  onRetryRead: () => void;

  onStartCheckout: () => void;
  isStartingCheckout: boolean;
  checkoutError: unknown;

  /** Where the unlocked quotes are read. Injected — this feature owns no route. */
  quotesHref: string;
  supportAction?: ReactNode;
}

export function UnlockPanel({
  phase,
  priceLabel,
  usableQuoteCount,
  teasers,
  isLoading,
  readError,
  onRetryRead,
  onStartCheckout,
  isStartingCheckout,
  checkoutError,
  quotesHref,
  supportAction,
}: UnlockPanelProps) {
  if (isLoading) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading the quotes on this request</span>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (readError !== null && readError !== undefined) {
    return (
      <AccessRefusal
        error={readError}
        attempting="see the quotes on this request"
        supportAction={supportAction}
        onRetry={onRetryRead}
        inline={false}
      />
    );
  }

  return (
    <section aria-labelledby="unlock-heading" className="rounded-card border border-line bg-surface p-4">
      <h2 id="unlock-heading" className="text-lg font-semibold text-text">
        Quotes for this request
      </h2>

      {teasers.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            compact
            title="No quotes yet"
            description="Professionals are still looking at this. Nothing is charged until at least one of them has quoted."
          />
        </div>
      ) : (
        <>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            {usableQuoteCount === 1
              ? "One professional has quoted. Here is what we can show you before you unlock it."
              : `${usableQuoteCount} professionals have quoted. Here is what we can show you before you unlock them.`}
          </p>
          <TeaserList teasers={teasers} />
        </>
      )}

      <div className="mt-4 border-t border-line pt-4">
        <UnlockAction
          phase={phase}
          priceLabel={priceLabel}
          onStartCheckout={onStartCheckout}
          isStartingCheckout={isStartingCheckout}
          quotesHref={quotesHref}
        />
        <div className="mt-3">
          <AccessRefusal
            error={checkoutError}
            attempting="unlock these quotes"
            supportAction={supportAction}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * The teaser rows — `M2-FE-401`, `M2-FE-405`.
 *
 * Everything on a row is a field the server chose to publish to somebody who has
 * paid nothing: a verification flag, a vendor type and a price band. There is no
 * name, no contact, no scope and no exact total, and there is nothing here to
 * withhold — the serializer never sent them, which is stronger than a component
 * choosing not to render them.
 *
 * **Out-of-budget quotes are labelled and kept.** `M2-FE-405` is explicit about
 * this. Hiding them would let the platform silently decide that a vendor who
 * quoted honestly above a budget the Customer half-guessed does not exist;
 * showing them unmarked would make the cheapest-looking option a trap.
 */
function TeaserList({ teasers }: { teasers: readonly TeaserView[] }) {
  return (
    <ul className="mt-3 flex list-none flex-col gap-2 p-0">
      {teasers.map((teaser) => (
        <li
          key={teaser.proposalId}
          className="flex items-start justify-between gap-4 rounded-card border border-line p-3"
        >
          <div className="min-w-0">
            <p className="font-medium text-text">{teaser.bandLabel}</p>
            <p className="mt-0.5 text-sm text-text-secondary">{teaser.vendorType}</p>
            {teaser.isOutOfBudget ? (
              <p className="mt-1 text-sm text-text-secondary">
                Above the budget you gave us. It is still a real quote — we are not hiding it.
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {teaser.isVerified ? <Badge tone="success">Verified</Badge> : null}
            {teaser.isOutOfBudget ? <Badge tone="warning">Over budget</Badge> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function UnlockAction({
  phase,
  priceLabel,
  onStartCheckout,
  isStartingCheckout,
  quotesHref,
}: {
  phase: UnlockPhase;
  priceLabel: string | null;
  onStartCheckout: () => void;
  isStartingCheckout: boolean;
  quotesHref: string;
}) {
  switch (phase) {
    case "unavailable":
      return (
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          We cannot offer this yet. There are quotes here, and we have not set a
          price for reading them, so there is nothing to pay and nothing you can
          do about it from this screen.
        </p>
      );

    case "not_yet":
      return (
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          Nothing is charged until at least one professional has sent a complete
          quote. When one has, you will be able to read it here.
        </p>
      );

    case "purchasable":
      return (
        <div>
          <p className="max-w-prose text-sm leading-6 text-text-secondary">
            Unlocking shows you the full scope, price and terms of every quote
            above, and who sent them. You are charged once for this request — not
            per quote, and not again if you come back later.
          </p>
          <div className="mt-3">
            <Button
              onClick={onStartCheckout}
              loading={isStartingCheckout}
              loadingLabel="Starting your payment"
              // `priceLabel` is null only in the `unavailable` phase, which
              // never reaches here. Guarded anyway: a button reading "Unlock
              // for" with nothing after it is worse than a disabled one.
              disabled={priceLabel === null}
            >
              {priceLabel === null ? "Unlock the quotes" : `Unlock the quotes for ${priceLabel}`}
            </Button>
          </div>
        </div>
      );

    case "pending":
      return (
        <div role="status">
          <p className="font-medium text-text">We are confirming your payment</p>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            Your bank or UPI app tells us the outcome, and that can take a few
            minutes — sometimes longer. This page updates itself when it arrives.
            Do not pay again: if the first payment goes through afterwards, you
            would have paid twice for one request.
          </p>
        </div>
      );

    case "granted":
      return (
        <div>
          <p className="font-medium text-text">You have unlocked these quotes</p>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            Read them in full, compare them and choose one. This is paid for
            once — coming back later costs nothing.
          </p>
          <div className="mt-3">
            <Link href={quotesHref} className="inline-block">
              <Button>Read the quotes</Button>
            </Link>
          </div>
        </div>
      );

    case "failed":
      return (
        <div>
          <p className="font-medium text-text">That payment did not go through</p>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            You have not been charged. The quotes are still here and still yours
            to unlock.
          </p>
          <div className="mt-3">
            <Button
              onClick={onStartCheckout}
              loading={isStartingCheckout}
              loadingLabel="Starting your payment"
              disabled={priceLabel === null}
            >
              {priceLabel === null ? "Try again" : `Try again — ${priceLabel}`}
            </Button>
          </div>
        </div>
      );

    case "refunded":
      return (
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          We refunded what you paid to unlock these quotes, in full. That happens
          when the date you needed the work by passed, or when every professional
          who quoted fell through before you chose one.
        </p>
      );

    default:
      // A phase this build does not know. Says so rather than offering a charge.
      return (
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          We cannot describe where this request stands right now. Nothing has
          been charged.
        </p>
      );
  }
}
