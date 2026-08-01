"use client";

import type { Schemas } from "@vsolve/api-client";
import { Button, Stepper } from "@vsolve/ui";
import { useEffect, useMemo, useRef, useState } from "react";

import { useCustomerSession } from "@/features/session/queries";

import {
  useAddresses,
  useCreateAddress,
  useReverseGeocode,
  useServiceability,
  useUpdateAddress,
} from "../queries";
import { STAGES_IMPLEMENTED, STAGE_LABELS, sequence } from "../model/stages";
import { AddressStage, isGeocoded } from "./address-stage";
import { LoginRequired, LoginStage } from "./login-stage";
import { PriceSummary } from "./price-summary";
import { ReviewStage } from "./review-stage";
import { ScopeStage } from "./scope-stage";
import type { TaskOption } from "./task-picker";
import { WindowRegion } from "./window-region";
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
  WINDOW_NOT_CHOSEN: "Arrival times are not open yet, so this booking cannot be finished today.",
  CONFIGURATION_NOT_LOADED: "Loading this service.",
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location permission is not available in this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 30_000,
      timeout: 12_000,
    });
  });
}

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
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const session = useCustomerSession();

  // Saved addresses are `IsAuthenticated`. Asking for them while anonymous
  // would spend a request to be told 401, and that 401 broadcasts a logout to
  // sibling tabs — so the question is only asked once there is someone to ask
  // about.
  const addressesQuery = useAddresses(session.isAuthenticated);
  const addresses = useMemo(() => addressesQuery.data ?? [], [addressesQuery.data]);
  const reverseGeocode = useReverseGeocode();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();

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

  /**
   * Moves focus to the new stage when the customer advances.
   *
   * Stages swap inside one persistent component rather than routing, so nothing
   * moves focus on its own: a keyboard or screen-reader user presses Continue
   * and is left on a button that has just been replaced, with no indication the
   * page changed. Focusing the labelled region announces which stage they are
   * now on, which is the one thing they cannot see.
   *
   * The first render is skipped deliberately — stealing focus on arrival would
   * scroll past the heading someone has not read yet.
   */
  const stageRegion = useRef<HTMLElement>(null);
  const announcedStage = useRef(state.stage);

  useEffect(() => {
    if (announcedStage.current === state.stage) return;
    announcedStage.current = state.stage;
    stageRegion.current?.focus();
  }, [state.stage]);

  const stages = sequence().filter((stage) => STAGES_IMPLEMENTED.includes(stage));
  // Login is an interrupt, not a step in the sequence, so the indicator keeps
  // showing the stage the customer is being returned to.
  const currentIndex = stages.indexOf(state.resumeStage ?? state.stage);

  function handleContinue() {
    if (state.stage === "scope" && !canContinue) {
      setShowScopeErrors(true);
      return;
    }
    setShowScopeErrors(false);
    advance();
  }

  async function handleUseCurrentLocation() {
    setLocationError(null);
    setIsLocating(true);

    try {
      const position = await currentPosition();
      const latitude = position.coords.latitude.toFixed(6);
      const longitude = position.coords.longitude.toFixed(6);
      const resolved = await reverseGeocode.mutateAsync({ latitude, longitude });
      const created = await createAddress.mutateAsync({
        label: addresses.length === 0 ? "Home" : "Saved address",
        line1: resolved.line1,
        locality: resolved.locality,
        city: resolved.city,
        state: resolved.state,
        postal_code: resolved.postal_code,
        country_code: resolved.country_code,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        source: "REVERSE_GEOCODED",
        is_default: addresses.length === 0,
      });

      dispatch({
        type: "SET_ADDRESS",
        address: {
          id: created.id,
          postalCode: created.postal_code,
          isGeocoded: isGeocoded(created),
          isServiceable: false,
        },
      });
    } catch (error) {
      setLocationError(
        errorMessage(
          error,
          "We could not save this location. Check permission and try again.",
        ),
      );
    } finally {
      setIsLocating(false);
    }
  }

  function handleUpdateAddress(
    addressId: string,
    patch: Schemas["PatchedAddressRequest"],
  ) {
    updateAddress.mutate(
      { addressId, patch },
      {
        onSuccess: (address) => {
          dispatch({
            type: "SET_ADDRESS",
            address: {
              id: address.id,
              postalCode: address.postal_code,
              isGeocoded: isGeocoded(address),
              isServiceable: false,
            },
          });
        },
      },
    );
  }

  /**
   * What the login screen shows back to the customer.
   *
   * Only values they entered themselves, and only the ones already chosen — an
   * empty row would read as something lost rather than something not yet done.
   */
  const loginSummary = useMemo(() => {
    const rows: { label: string; value: string }[] = [
      { label: "Service", value: service.name },
    ];
    const taskCount = state.taskLines.reduce((sum, line) => sum + line.quantity, 0);
    if (taskCount > 0) {
      rows.push({ label: "Jobs selected", value: String(taskCount) });
    }
    if (state.notes.trim().length > 0) {
      rows.push({ label: "Your note", value: state.notes });
    }
    return rows;
  }, [service.name, state.taskLines, state.notes]);

  return (
    // The action bar is fixed over the content on a phone, and the viewport is
    // `viewportFit: cover`, so the reserved space has to clear the home
    // indicator as well as the bar itself.
    <div className="mx-auto w-full max-w-5xl px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-6 lg:pb-12">
      <Stepper
        steps={stages.map((stage) => ({ id: stage, title: STAGE_LABELS[stage] }))}
        current={currentIndex < 0 ? 0 : currentIndex}
      />

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main
          ref={stageRegion}
          tabIndex={-1}
          aria-label={STAGE_LABELS[state.stage]}
          className="outline-none"
        >
          {state.stage === "login" ? <LoginStage summary={loginSummary} /> : null}

          {state.stage === "address" && session.isAnonymous ? (
            <LoginRequired
              title="Where should we come?"
              message="Service addresses are saved to your account, so this step needs you to be logged in. It takes a code by SMS."
              returnTo="address"
            />
          ) : null}

          {state.stage === "address" && !session.isAnonymous ? (
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
              onUseCurrentLocation={handleUseCurrentLocation}
              isUsingCurrentLocation={
                isLocating || reverseGeocode.isPending || createAddress.isPending
              }
              locationError={locationError}
              onUpdateAddress={handleUpdateAddress}
              isUpdatingAddress={updateAddress.isPending}
              updateError={
                updateAddress.error
                  ? errorMessage(updateAddress.error, "We could not save this address.")
                  : null
              }
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
            // Server-authored windows are not published (BE-06). This renders the
            // boundary and issues no request; the picker itself is unchanged and
            // takes over the day the operation exists.
            <WindowRegion availability={{ status: "unpublished" }} />
          ) : null}

          {state.stage === "review" && session.isAnonymous ? (
            // Only reachable when the session ended part-way through: the
            // address stage cannot be completed without one.
            <div className="mb-4">
              <LoginRequired
                title="Your session ended"
                message="Log in again to carry on. Everything you have chosen is still here."
                returnTo="review"
              />
            </div>
          ) : null}

          {state.stage === "review" ? (
            <ReviewStage
              // No published quote operation, so there is no price to render and
              // none is invented. `ReviewStage` already words this honestly.
              quote={null}
              service={service}
              addressLine={
                selectedAddress
                  ? [selectedAddress.line1, selectedAddress.locality, selectedAddress.city]
                      .filter(Boolean)
                      .join(", ")
                  : null
              }
              // A window cannot be chosen until BE-06 publishes them, so there is
              // never a label to show. Review says "Not set" rather than guessing.
              windowLabel={null}
              onContinue={onProceedToCheckout}
            />
          ) : null}
        </main>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <PriceSummary
            quote={null}
            startingPricePaise={variant.starting_price.amount_paise}
            isLoading={false}
          />
        </aside>
      </div>

      {/* Review and login own their own actions: review hands off to checkout,
          and login is left by authenticating or by cancelling, never by the
          generic Continue. */}
      {state.stage === "review" || state.stage === "login" ? null : (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:static lg:mt-8 lg:border-0 lg:bg-transparent lg:p-0">
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
