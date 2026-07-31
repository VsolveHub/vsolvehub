"use client";

import { Badge, EmptyState } from "@vsolve/ui";

import { AUTO_ASSIGN_ID, type ProviderOptionView } from "../adapters";
import { ChoiceCard } from "./choice-card";
import { useWorkspace } from "./workspace-context";

/**
 * Provider selection — **Scheduled only**.
 *
 * This component is never rendered in the Instant sequence, and that is enforced
 * upstream rather than by a prop here: `sequenceFor("INSTANT")` does not contain
 * the `provider` stage, so the workspace has no branch that can reach it. The
 * B3 acceptance criterion "no provider-selection UI is reachable in the Instant
 * flow" is therefore a property of the sequence, checked in `machine.test.ts`.
 *
 * Cards show only what doc 03 §5 calls decision-useful information. Nothing is
 * shown that the customer cannot act on, and no field is invented to fill space:
 * a Partner with no ratings shows no rating rather than "New" or five empty
 * stars.
 */

export interface ProviderStageProps {
  options: ProviderOptionView[];
}

export function ProviderStage({ options }: ProviderStageProps) {
  const { state, dispatch } = useWorkspace();

  if (options.length === 0) {
    return (
      <EmptyState
        title="No professionals are free for this time"
        description="Choosing a different slot usually helps — availability varies through the day."
      />
    );
  }

  const selectedId =
    state.provider === null
      ? null
      : state.provider.kind === "auto"
        ? AUTO_ASSIGN_ID
        : state.provider.partnerId;

  return (
    <fieldset className="border-0 p-0">
      <legend className="text-lg font-semibold text-text">
        Who would you like?
      </legend>
      <p className="mt-1 text-sm text-text-secondary">
        All of these are verified for this work and free at your chosen time.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {options.map((option) => (
          <ChoiceCard
            key={option.id}
            name="provider"
            value={option.id}
            checked={selectedId === option.id}
            onSelect={() =>
              dispatch({
                type: "SELECT_PROVIDER",
                provider: option.isAutoAssign
                  ? { kind: "auto" }
                  : { kind: "partner", partnerId: option.id },
              })
            }
            title={option.name}
            description={option.availabilityText}
            trailing={
              option.priceDifferenceLabel ? (
                <span data-numeric className="font-semibold text-text">
                  {option.priceDifferenceLabel}
                </span>
              ) : null
            }
          >
            <span className="mt-2 flex flex-wrap items-center gap-2">
              {option.description ? (
                <Badge tone="action">{option.description}</Badge>
              ) : null}
              {option.previouslyBooked ? (
                <Badge tone="info">Booked before</Badge>
              ) : null}
              {option.skillBadge ? (
                <Badge tone="neutral">{option.skillBadge}</Badge>
              ) : null}
              {option.ratingLabel ? (
                <span className="text-sm text-text-secondary">{option.ratingLabel}</span>
              ) : null}
              {option.experienceLabel ? (
                <span className="text-sm text-text-secondary">
                  {option.experienceLabel}
                </span>
              ) : null}
            </span>
          </ChoiceCard>
        ))}
      </div>
    </fieldset>
  );
}
