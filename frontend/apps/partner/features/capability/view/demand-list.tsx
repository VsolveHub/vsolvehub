"use client";

import { Badge, Card, EmptyState, cn, useT } from "@vsolve/ui";
import { MapPin } from "lucide-react";

import { AsyncSection, type AsyncState } from "@/components/async-section";

import type { DemandCard, DemandView } from "../adapters/demand";

/**
 * Masked live demand — the end of the express path.
 *
 * Closes the demand half of `M2-FE-101`.
 *
 * ## What this screen is for
 *
 * Proving there is work here, to someone who has given four things and proved
 * nothing. It is the payoff for the short path, and it is why the path is short:
 * a Partner who has seen three real jobs in their own locality will go and find
 * their Aadhaar; one who has been asked for it first will not.
 *
 * ## Why an ineligible card still renders
 *
 * Filtering to eligible leads would show almost every new Partner an empty
 * screen, and empty is indistinguishable from "there is no work here" — the one
 * false impression this marketplace cannot afford. Showing it as actionable
 * would be the opposite lie. So the card renders, carries the server's own hint
 * about what stands in the way, and offers no action it cannot honour. There is
 * deliberately no "accept" here: the accept lives behind the enquiry, behind the
 * capability, behind KYC.
 *
 * ## The three empty states are different questions
 *
 * "You matched nothing" (`matchedServiceCount === 0`) is a setup problem — add a
 * service. "Nothing right now" is a timing problem — check back. "All of it
 * needs approval you do not have" is an approval problem — request a capability.
 * Collapsing them into one "no results" would send all three people to the wrong
 * place, which is the same fabricated-progress failure `M2-FE-215` forbids on
 * the customer side.
 */

export interface DemandListProps {
  readonly state: AsyncState<DemandView>;
  readonly onRetry?: () => void;
  readonly className?: string;
}

export function DemandList({ state, onRetry, className }: DemandListProps) {
  const t = useT();
  return (
    <AsyncSection
      state={state}
      label={t("me.capability.demand.loading")}
      onRetry={onRetry}
      className={className}
      isEmpty={(view) => view.isEmpty}
      empty={<DemandEmpty state={state} />}
    >
      {(view) => (
        <div className={cn("flex flex-col gap-3", className)}>
          {view.isAllIneligible ? (
            <p className="rounded-card bg-surface-sunken px-4 py-3 text-sm leading-6 text-text-secondary">
              {t("me.capability.demand.ineligibleNotice")}
            </p>
          ) : null}

          <ul className="flex list-none flex-col gap-3 p-0">
            {view.cards.map((card) => (
              <li key={card.id}>
                <DemandRow card={card} />
              </li>
            ))}
          </ul>

          <p className="text-xs leading-5 text-text-muted">
            {t("me.capability.demand.privacyNote")}
          </p>
        </div>
      )}
    </AsyncSection>
  );
}

/**
 * The empty state, which depends on *why* it is empty.
 *
 * Reads `matchedServiceCount` from the successful payload, so it can only be
 * rendered from a ready state — hence the state prop rather than a boolean.
 */
function DemandEmpty({ state }: { state: AsyncState<DemandView> }) {
  const matched = state.status === "ready" ? state.data.matchedServiceCount : 0;
  const t = useT();

  if (matched === 0) {
    return (
      <EmptyState
        title={t("me.capability.demand.emptyNoMatchTitle")}
        description={t("me.capability.demand.emptyNoMatchDescription")}
      />
    );
  }

  return (
    <EmptyState
      title={t("me.capability.demand.emptyNoneNearbyTitle")}
      description={t("me.capability.demand.emptyNoneNearbyDescription")}
    />
  );
}

function DemandRow({ card }: { card: DemandCard }) {
  const t = useT();
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">{card.headline}</h3>
        {/* Null when this build has no screens for the key. A machine value like
            `A3_TIME_BLOCK` is never printed for a human to read. */}
        {card.workspaceLabel ? <Badge tone="neutral">{card.workspaceLabel}</Badge> : null}
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-sm text-text-secondary">
        <MapPin size={14} aria-hidden className="shrink-0 text-text-muted" />
        {/* A locality, never a street — the server keeps the address out of the
            payload entirely, so there is nothing here to redact. */}
        <span>{card.areaLabel}</span>
      </p>

      {/* Nullable on the wire: a customer who has not named a start date is an
          ordinary case, and "Starts Invalid Date" on the first screen a new
          Partner sees would be worse than saying nothing. */}
      {card.startsOn === null ? (
        <p className="mt-1 text-sm text-text-secondary">{t("me.capability.demand.noStartDate")}</p>
      ) : (
        <p className="mt-1 text-sm text-text-secondary">
          {t("me.capability.demand.startsLabel")}{" "}
          <time dateTime={card.startsOn}>
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeZone: "Asia/Kolkata",
            }).format(new Date(card.startsOn))}
          </time>
        </p>
      )}

      {card.isEligible ? (
        <p className="mt-3 text-sm font-medium text-success-text">
          {t("me.capability.demand.eligibleNote")}
        </p>
      ) : (
        <p className="mt-3 rounded-control bg-surface-sunken px-3 py-2 text-sm leading-6 text-text-secondary">
          {card.hint || t("me.capability.demand.ineligibleFallbackHint")}
        </p>
      )}
    </Card>
  );
}
