"use client";

import type { Schemas } from "@vsolve/api-client";
import { Button, Stepper } from "@vsolve/ui";
import { useEffect, useMemo, useState } from "react";

import {
  useAddresses,
  useAvailability,
  useEligiblePartners,
  useInstantPreCheck,
  useQuote,
  useServiceability,
} from "../queries";
import {
  STAGES_IMPLEMENTED_BY_B3,
  STAGE_LABELS,
  sequenceFor,
  type Stage,
} from "../model/stages";
import { AddressStage, isGeocoded } from "./address-stage";
import { BookingTypeStage } from "./booking-type-stage";
import { DurationStage } from "./duration-stage";
import { PreCheckStage } from "./precheck-stage";
import { PriceSummary } from "./price-summary";
import { ProviderStage } from "./provider-stage";
import { ReviewStage } from "./review-stage";
import { ScopeStage } from "./scope-stage";
import { SlotStage } from "./slot-stage";
import { useWorkspace } from "./workspace-context";

/**
 * The booking workspace shell.
 *
 * One persistent component for the whole journey. Stages swap inside it rather
 * than routing between pages, which is what makes going back free — no refetch,
 * no remount, no lost answers.
 *
 * Layout follows doc 03: on desktop a main column with a sticky summary rail; on
 * mobile one task at a time with the price and the primary action pinned to the
 * bottom. The summary is always present, never conditional, so the price never
 * appears to arrive from nowhere.
 */

const BLOCK_MESSAGES: Record<string, string> = {
  FULFILMENT_NOT_CHOSEN: "Choose when you need this.",
  ADDRESS_NOT_CONFIRMED: "Choose the address for this job.",
  ADDRESS_NOT_SERVICEABLE: "We do not cover this address yet.",
  ADDRESS_NOT_GEOCODED:
    "This address is not pinned on the map, so we cannot book it for now. Pick a time slot instead, or use a pinned address.",
  REQUIRED_QUESTION_UNANSWERED: "Answer the questions marked required.",
  DURATION_OUT_OF_BOUNDS: "Choose how long the work should take.",
  SLOT_NOT_CHOSEN: "Choose a start time.",
  PROVIDER_NOT_CHOSEN: "Choose a professional, or let us pick.",
  HOLD_NOT_HELD: "We are holding your slot.",
  PRECHECK_NOT_PASSED: "We are checking availability near you.",
  CONFIGURATION_NOT_LOADED: "Loading this service.",
};

export interface BookingWorkspaceProps {
  service: Schemas["ServiceDetail"];
  variant: Schemas["ServiceVariantConfiguration"];
  /** Ids of items already in the cart, used for the Instant split notice. */
  cartHasOtherItems?: boolean;
  /** Owned by B4. Present so review can hand off rather than dead-end. */
  onProceedToCheckout?: () => void;
}

export function BookingWorkspace({
  service,
  variant,
  cartHasOtherItems = false,
  onProceedToCheckout,
}: BookingWorkspaceProps) {
  const { state, dispatch, blocked, canContinue, durationMinutes, advance, back, goTo } =
    useWorkspace();
  const [showScopeErrors, setShowScopeErrors] = useState(false);

  const addressesQuery = useAddresses();
  const addresses = useMemo(() => addressesQuery.data ?? [], [addressesQuery.data]);

  const selectedAddress = useMemo(
    () => addresses.find((address) => address.id === state.address?.id) ?? null,
    [addresses, state.address?.id],
  );

  const serviceabilityQuery = useServiceability({
    postalCode: selectedAddress?.postal_code ?? null,
    serviceVariantId: variant.id,
    durationMinutes,
  });

  // The serviceability verdict is a server answer, so it updates the machine
  // rather than being read ad hoc by whichever component needs it.
  useEffect(() => {
    if (selectedAddress === null || serviceabilityQuery.data === undefined) return;
    dispatch({
      type: "SET_ADDRESS",
      address: {
        id: selectedAddress.id,
        postalCode: selectedAddress.postal_code,
        isGeocoded: isGeocoded(selectedAddress),
        isServiceable: serviceabilityQuery.data.is_serviceable,
      },
    });
  }, [selectedAddress, serviceabilityQuery.data, dispatch]);

  const availabilityInput =
    state.fulfilment === "SCHEDULED" && state.address !== null && durationMinutes !== null
      ? {
          serviceVariantId: variant.id,
          addressId: state.address.id,
          durationMinutes,
        }
      : null;

  const availabilityQuery = useAvailability(
    state.stage === "slot" ? availabilityInput : null,
  );

  const partnersQuery = useEligiblePartners(
    state.stage === "provider" && availabilityInput !== null && state.slotId !== null
      ? { ...availabilityInput, slotId: state.slotId }
      : null,
  );

  const preCheckInput =
    state.fulfilment === "INSTANT" && state.address !== null && durationMinutes !== null
      ? { serviceVariantId: variant.id, addressId: state.address.id, durationMinutes }
      : null;

  const preCheckQuery = useInstantPreCheck(
    state.stage === "precheck" ? preCheckInput : null,
  );

  useEffect(() => {
    if (preCheckQuery.data === undefined) return;
    dispatch({ type: "PRECHECK_RESULT", canDispatch: preCheckQuery.data.canDispatch });
  }, [preCheckQuery.data, dispatch]);

  // The quote needs a server cart, which B4 creates. Until then review shows the
  // "starts at" and says plainly that the final price is still to come, rather
  // than displaying a number nobody quoted.
  const quoteQuery = useQuote(null);

  const stages = state.fulfilment === null
    ? (["address", "type"] as Stage[])
    : sequenceFor(state.fulfilment).filter((stage) =>
        STAGES_IMPLEMENTED_BY_B3.includes(stage),
      );

  const currentIndex = stages.indexOf(state.stage);

  function handleContinue() {
    if (state.stage === "scope" && !canContinue) {
      setShowScopeErrors(true);
      return;
    }
    setShowScopeErrors(false);
    advance();
  }

  const selectedSlotLabel = useMemo(() => {
    const days = availabilityQuery.data?.days ?? [];
    for (const day of days) {
      const slot = day.slots.find((candidate) => candidate.id === state.slotId);
      if (slot) return `${day.label}, ${slot.label}`;
    }
    return null;
  }, [availabilityQuery.data, state.slotId]);

  const providerLabel = useMemo(() => {
    const provider = state.provider;
    if (provider === null) return null;
    if (provider.kind === "auto") return "Auto assign";
    const match = (partnersQuery.data ?? []).find(
      (option) => !option.isAutoAssign && option.id === provider.partnerId,
    );
    // Falls back to a neutral phrase rather than inventing a name: the partner
    // list is not cached across stages, so it may genuinely be absent here.
    return match?.name ?? "Chosen professional";
  }, [state.provider, partnersQuery.data]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-32 pt-6 lg:pb-12">
      <Stepper
        steps={stages.map((stage) => ({ id: stage, title: STAGE_LABELS[stage] }))}
        current={currentIndex < 0 ? 0 : currentIndex}
      />

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main>
          {state.stage === "address" ? (
            <AddressStage
              addresses={addresses}
              isLoading={addressesQuery.isPending}
              serviceability={serviceabilityQuery.data ?? null}
              isCheckingServiceability={serviceabilityQuery.isFetching}
              onSelect={(address) =>
                dispatch({
                  type: "SET_ADDRESS",
                  address: {
                    id: address.id,
                    postalCode: address.postal_code,
                    isGeocoded: isGeocoded(address),
                    // Optimistic false until the check answers; the effect above
                    // corrects it. Never optimistic true.
                    isServiceable: false,
                  },
                })
              }
              onAddAddress={() => {
                window.location.href = "/profile/addresses";
              }}
            />
          ) : null}

          {state.stage === "type" ? <BookingTypeStage /> : null}

          {state.stage === "scope" ? (
            <ScopeStage questions={variant.questions} showErrors={showScopeErrors} />
          ) : null}

          {state.stage === "duration" ? <DurationStage /> : null}

          {state.stage === "slot" ? (
            availabilityQuery.data ? (
              <SlotStage
                availability={availabilityQuery.data}
                onSwitchToInstant={() =>
                  dispatch({ type: "SELECT_FULFILMENT", fulfilment: "INSTANT" })
                }
              />
            ) : (
              <p className="py-8 text-text-secondary">Loading available times…</p>
            )
          ) : null}

          {state.stage === "provider" ? (
            partnersQuery.data ? (
              <ProviderStage options={partnersQuery.data} />
            ) : (
              <p className="py-8 text-text-secondary">Finding available professionals…</p>
            )
          ) : null}

          {state.stage === "precheck" ? (
            preCheckQuery.data ? (
              <PreCheckStage
                result={preCheckQuery.data}
                onSwitchToScheduled={() =>
                  dispatch({ type: "SELECT_FULFILMENT", fulfilment: "SCHEDULED" })
                }
                onChangeAddress={() => goTo("address")}
                onRetry={() => void preCheckQuery.refetch()}
              />
            ) : (
              <p className="py-8 text-text-secondary">
                Checking for professionals near you…
              </p>
            )
          ) : null}

          {state.stage === "review" ? (
            <ReviewStage
              quote={quoteQuery.data ?? null}
              service={service}
              addressLine={
                selectedAddress
                  ? [selectedAddress.line1, selectedAddress.locality, selectedAddress.city]
                      .filter(Boolean)
                      .join(", ")
                  : null
              }
              slotLabel={selectedSlotLabel}
              providerLabel={providerLabel}
              arrivalText={preCheckQuery.data?.arrivalText ?? null}
              instantSplitsFromCart={state.fulfilment === "INSTANT" && cartHasOtherItems}
              onContinue={onProceedToCheckout}
              continueLabel={state.fulfilment === "INSTANT" ? "Continue to payment" : "Continue"}
            />
          ) : null}
        </main>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <PriceSummary
            quote={quoteQuery.data ?? null}
            startingPricePaise={variant.starting_price.amount_paise}
            isLoading={quoteQuery.isPending && quoteQuery.fetchStatus === "fetching"}
          />
        </aside>
      </div>

      {state.stage === "review" ? null : (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface p-4 lg:static lg:mt-8 lg:border-0 lg:bg-transparent lg:p-0">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <Button variant="ghost" onClick={back} disabled={state.stage === "address"}>
              Back
            </Button>

            <div className="flex flex-1 items-center justify-end gap-4">
              {blocked && !canContinue ? (
                <p className="text-sm text-text-secondary" aria-live="polite">
                  {BLOCK_MESSAGES[blocked] ?? "Complete this step to continue."}
                </p>
              ) : null}
              <Button onClick={handleContinue} disabled={!canContinue}>
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
