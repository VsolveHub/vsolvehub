"use client";

import type { Schemas } from "@vsolve/api-client";
import { Button, Stepper } from "@vsolve/ui";
import { useEffect, useMemo, useState } from "react";

import { useAddresses, useQuote, useServiceability, useWindows } from "../queries";
import { STAGES_IMPLEMENTED, STAGE_LABELS, sequence } from "../model/stages";
import { AddressStage, isGeocoded } from "./address-stage";
import { PriceSummary } from "./price-summary";
import { ReviewStage } from "./review-stage";
import { ScopeStage } from "./scope-stage";
import type { TaskOption } from "./task-picker";
import { WindowStage } from "./window-stage";
import { useWorkspace } from "./workspace-context";

/**
 * The booking workspace shell.
 *
 * One persistent component for the whole journey. Stages swap inside it rather
 * than routing between pages, which is what makes going back free — no refetch,
 * no remount, no lost answers.
 *
 * Layout: on desktop a main column with a sticky summary rail; on mobile one
 * task at a time with the price and the primary action pinned to the bottom. The
 * summary is always present, never conditional, so the price never appears to
 * arrive from nowhere.
 */

const BLOCK_MESSAGES: Record<string, string> = {
  ADDRESS_NOT_CONFIRMED: "Choose the address for this job.",
  ADDRESS_NOT_SERVICEABLE: "We do not cover this address yet.",
  NO_TASK_SELECTED: "Choose at least one job.",
  REQUIRED_QUESTION_UNANSWERED: "Answer the questions marked required.",
  WINDOW_NOT_CHOSEN: "Choose an arrival window.",
  CONFIGURATION_NOT_LOADED: "Loading this service.",
};

export interface BookingWorkspaceProps {
  service: Schemas["ServiceDetail"];
  variant: Schemas["ServiceVariantConfiguration"];
  /**
   * Task rates for this variant.
   *
   * Passed in rather than read from `variant` because the published contract
   * does not carry task rates yet — see proposal 0003 §A3. When it does, this
   * prop disappears and the picker reads the variant directly.
   */
  tasks: readonly TaskOption[];
  /** Minimum service subtotal in paise, or null while unpublished. */
  minimumSubtotalPaise: number | null;
  /** Owned by the checkout stage. Present so review can hand off, not dead-end. */
  onProceedToCheckout?: () => void;
}

export function BookingWorkspace({
  service,
  variant,
  tasks,
  minimumSubtotalPaise,
  onProceedToCheckout,
}: BookingWorkspaceProps) {
  const { state, dispatch, blocked, canContinue, advance, back } = useWorkspace();
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

  const windowsQuery = useWindows(
    state.stage === "window" && state.address !== null
      ? {
          serviceVariantId: variant.id,
          addressId: state.address.id,
          taskLines: state.taskLines,
        }
      : null,
  );

  // The quote needs a server cart, which the checkout stage creates. Until then
  // the summary shows the "starts at" and says plainly that the final price is
  // still to come, rather than displaying a number nobody quoted.
  const quoteQuery = useQuote(null);

  const stages = sequence().filter((stage) => STAGES_IMPLEMENTED.includes(stage));
  const currentIndex = stages.indexOf(state.stage);

  function handleContinue() {
    if (state.stage === "scope" && !canContinue) {
      setShowScopeErrors(true);
      return;
    }
    setShowScopeErrors(false);
    advance();
  }

  const selectedWindowLabel = useMemo(() => {
    for (const day of windowsQuery.data?.days ?? []) {
      const match = day.windows.find((candidate) => candidate.id === state.windowId);
      if (match) return `${day.label}, ${match.label}`;
    }
    return null;
  }, [windowsQuery.data, state.windowId]);

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

          {state.stage === "scope" ? (
            <ScopeStage
              questions={variant.questions}
              tasks={tasks}
              minimumSubtotalPaise={minimumSubtotalPaise}
              showErrors={showScopeErrors}
            />
          ) : null}

          {state.stage === "window" ? (
            windowsQuery.data ? (
              <WindowStage windows={windowsQuery.data} />
            ) : (
              <p className="py-8 text-text-secondary">Loading available windows…</p>
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
              windowLabel={selectedWindowLabel}
              onContinue={onProceedToCheckout}
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
