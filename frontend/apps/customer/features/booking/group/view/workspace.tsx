"use client";

import { describeError } from "@vsolve/query";
import { Button, ErrorState, Skeleton, Stepper, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useCustomerSession } from "@/features/session/queries";

import {
  useAddresses,
  useCreateAddress,
  useReverseGeocode,
  useServiceability,
  useUpdateAddress,
} from "../../queries";
import { AddressStage } from "../../view/address-stage";
import {
  cartMergeConflict,
  cartVersionConflict,
  isPlanStale,
  isQuoteExpired,
  planUnavailable,
  type PlanItemFailure,
} from "../conflicts";
import { describeConfirmFailure, describeQuoteFailure } from "../reasons";
import {
  useCandidateStarts,
  useCart,
  useCreateCheckout,
  useCreatePlanQuote,
  useCreatePlanSet,
  useMergeCart,
  usePlanQuote,
  usePlanSet,
  useUpdateCartItem,
  type Cart,
  type CartItem,
  type Checkout,
} from "../queries";
import { CartItems, CartVersionNote } from "./cart-items";
import { GroupLogin } from "./group-login";
import { GroupResult } from "./group-result";
import { MergeDialog } from "./merge-dialog";
import { PlanComparison } from "./plan-comparison";
import { QuoteReview } from "./quote-review";
import { ScheduleStep } from "./schedule-step";

/**
 * The multi-item booking workspace.
 *
 * Cart → address and preferred start → server plan alternatives → the selected
 * plan's group quote → confirmation. Login is an interrupt raised the first time
 * a step needs a session, not a step in the sequence, so the indicator keeps
 * showing where the customer is being returned to.
 *
 * ## What this component does not do
 *
 * It does not decide which services can share a visit, how many professionals
 * are needed, when a unit starts, what anything costs, or whether a plan is
 * still usable. Each of those is a field on a server response, and the one place
 * this component *could* have inferred something — two services in the same
 * category obviously go together — is exactly the inference the product model
 * forbids.
 *
 * ## Server state is cached, not copied
 *
 * The plan set and the quote are held as **ids**, and read back through
 * TanStack Query. Copying either response into React state would freeze a record
 * that carries its own `status` and `expires_at`: the local copy would still say
 * `ACTIVE` long after Django had withdrawn it, and every staleness check written
 * against it would be dead code that could never fire. Holding the id instead
 * means "is this still usable?" is answered by a re-read on focus and reconnect,
 * which is what makes the recovery paths below reachable.
 *
 * Only the checkout response is kept locally, because it is a command result
 * with no published customer read of its own.
 *
 * ## Recovery is always a re-read
 *
 * Every conflict path ends at authoritative server state rather than at a local
 * correction. A stale cart version refetches the cart; a stale plan set discards
 * the local selection and asks Django again; an expired or invalidated quote
 * sends the customer back to a cart they can actually see. Nothing is patched up
 * locally to look like it still works.
 */

/**
 * Removal is published without the body Django requires.
 *
 * `DELETE /api/v1/cart/items/{item_id}/` still carries no `requestBody` as of
 * published contract 1.10.0, while the Django view reads `expected_cart_version` and
 * `expected_item_version` from one — so the generated client cannot express a
 * request the server would accept. Sending it anyway, or reaching around the
 * generated types to attach a body, would be inventing a contract. The row says
 * so instead, and `contracts/proposals/0007-cart-item-removal-body.md` asks for
 * the operation to be republished with its request body.
 */
const REMOVAL_BOUNDARY =
  "Removing a service is not available yet — the published API does not accept the " +
  "version check this needs. You can set the quantity you want, or start a new booking.";

type Step = "cart" | "schedule" | "plans" | "review" | "confirmed";

const STEP_LABELS: Record<Step, string> = {
  cart: "Your booking",
  schedule: "Where and when",
  plans: "How we do it",
  review: "Review",
  confirmed: "Confirmed",
};

const STEP_SEQUENCE: readonly Step[] = ["cart", "schedule", "plans", "review", "confirmed"];

function CartSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 2 }, (_, index) => (
        <Skeleton key={index} className="h-32 w-full" />
      ))}
    </div>
  );
}

export function GroupBookingWorkspace() {
  const session = useCustomerSession();

  const [step, setStep] = useState<Step>("cart");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [preferredStart, setPreferredStart] = useState<string | null>(null);
  const [planSetId, setPlanSetId] = useState<string | null>(null);
  const [planChoice, setPlanChoice] = useState<string | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [planFailures, setPlanFailures] = useState<PlanItemFailure[] | null>(null);
  const [mergeDismissed, setMergeDismissed] = useState(false);

  const cartQuery = useCart();
  const cart: Cart | undefined = cartQuery.data;

  // Django performs the login merge inside `GET /cart/` and refuses with
  // `cart_merge_conflict` when a human has to choose. The refusal is read off
  // the cart read rather than from a separate probe, because a second request
  // would be a second merge attempt.
  const mergeConflict = mergeDismissed ? null : cartMergeConflict(cartQuery.error);

  const addressesQuery = useAddresses(session.isAuthenticated);
  const addresses = addressesQuery.data ?? [];
  const selectedAddress = addresses.find((address) => address.id === addressId) ?? null;

  const reverseGeocode = useReverseGeocode();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();
  const updateItem = useUpdateCartItem();
  const mergeCart = useMergeCart();
  const createPlanSet = useCreatePlanSet();
  const createQuote = useCreatePlanQuote();
  const createCheckout = useCreateCheckout();

  const serviceabilityQuery = useServiceability({
    postalCode: selectedAddress?.postal_code ?? null,
    serviceVariantId: null,
  });

  /**
   * Candidate start times.
   *
   * Requested only on the schedule step, and keyed by cart version as well as
   * address: a list of times fetched for a two-service cart is not the answer
   * for a three-service one. Asking earlier would show times that have moved on
   * by the time anyone looks at them.
   */
  const startsQuery = useCandidateStarts(
    step === "schedule" && cart && addressId !== null
      ? { cartVersion: cart.version, addressId }
      : null,
  );

  /**
   * The plan set and the quote, read back from the server that minted them.
   *
   * The creating mutation seeds the cache with its own response, so neither of
   * these opens with a spinner; what the query adds is the revalidation that
   * makes `status` mean something over time.
   */
  const planSetQuery = usePlanSet(planSetId);
  const planSet = planSetQuery.data ?? null;
  const quoteQuery = usePlanQuote(quoteId);
  const quote = quoteQuery.data ?? null;

  /**
   * A plan the server has stopped standing behind cannot stay selected.
   *
   * Derived on render rather than corrected in an effect. An effect that calls
   * `setSelectedPlanId(null)` renders the withdrawn selection once, then renders
   * again without it — so for one commit the screen offers a Continue button
   * that leads to a plan Django would refuse to price. Deriving it means that
   * intermediate state cannot exist at all, which is a stronger guarantee than
   * correcting it quickly.
   */
  const isPlanSetUsable = planSet !== null && planSet.status === "ACTIVE";
  const selectedPlanId = isPlanSetUsable ? planChoice : null;

  /**
   * Moves focus to the step the customer just reached.
   *
   * Steps swap inside one persistent component rather than routing, so nothing
   * moves focus on its own: a keyboard or screen-reader user presses a button
   * that is then replaced, with no indication the page changed. The first render
   * is skipped so arriving does not scroll past an unread heading.
   */
  const stepRegion = useRef<HTMLElement>(null);
  const announcedStep = useRef(step);

  useEffect(() => {
    if (announcedStep.current === step) return;
    announcedStep.current = step;
    stepRegion.current?.focus();
  }, [step]);

  /** Discards everything derived from a plan and returns to authoritative cart truth. */
  function returnToCart() {
    setPlanSetId(null);
    setPlanChoice(null);
    setQuoteId(null);
    setPlanFailures(null);
    createQuote.reset();
    createCheckout.reset();
    setStep("cart");
  }

  /** Drops the stale plan and asks Django for fresh alternatives. */
  function replan() {
    setPlanSetId(null);
    setPlanChoice(null);
    setQuoteId(null);
    createQuote.reset();
    createCheckout.reset();
    setStep("schedule");
  }

  function requireSession(next: Step): boolean {
    if (session.isAuthenticated) {
      setStep(next);
      return true;
    }
    setIsLoggingIn(true);
    return false;
  }

  function handlePlan() {
    if (!cart || addressId === null || preferredStart === null) return;
    setPlanFailures(null);
    createPlanSet.mutate(
      { cartVersion: cart.version, addressId, preferredStart },
      {
        onSuccess: (result) => {
          setPlanSetId(result.id);
          // Only a recommendation is preselected, and only because the server
          // marked it. Nothing is chosen on the customer's behalf otherwise.
          setPlanChoice(result.plans.find((plan) => plan.is_recommended)?.id ?? null);
          setStep("plans");
        },
        onError: (error) => {
          const failures = planUnavailable(error);
          if (failures !== null) setPlanFailures(failures);
          if (cartVersionConflict(error) !== null) returnToCart();
        },
      },
    );
  }

  function handleQuote() {
    if (selectedPlanId === null) return;
    createQuote.mutate(selectedPlanId, {
      onSuccess: (result) => {
        setQuoteId(result.id);
        setStep("review");
      },
      onError: (error) => {
        // `fulfilment_plan_stale` means the whole set was priced against inputs
        // that have moved on, so no other plan in it is any better. Re-planning
        // is the only recovery; keeping the customer on a dead list is not.
        if (isPlanStale(error) || cartVersionConflict(error) !== null) {
          setPlanSetId(null);
          setPlanChoice(null);
          setStep("schedule");
          return;
        }
        // Otherwise only this plan was refused. Clearing the choice re-reads the
        // set rather than leaving a selection that cannot proceed.
        setPlanChoice(null);
      },
    });
  }

  function handleConfirm() {
    if (quote === null) return;
    createCheckout.mutate(quote.id, {
      onSuccess: (result) => {
        setCheckout(result);
        setStep("confirmed");
      },
      onError: (error) => {
        // An expired or already-consumed quote is not a failed confirmation, it
        // is a price that stopped applying. `QuoteReview` renders that state
        // from the quote's own `status`, so re-reading is what surfaces it.
        if (isQuoteExpired(error)) void quoteQuery.refetch();
      },
    });
  }

  const visibleStep = isLoggingIn ? null : step;
  const stepIndex = STEP_SEQUENCE.indexOf(step);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      {/* The route's one level-one heading. The steps below are sections of this
          page rather than pages of their own — they swap inside one persistent
          component — so promoting a step heading to `h1` would move the document's
          top-level landmark every time the customer pressed Continue. */}
      <h1 className="text-xl font-bold text-text">Your booking</h1>

      <div className="mt-4">
        <Stepper
          steps={STEP_SEQUENCE.map((id) => ({ id, title: STEP_LABELS[id] }))}
          current={stepIndex < 0 ? 0 : stepIndex}
        />
      </div>

      {/* Steps swap without a navigation, so nothing announces the change on its
          own. Focus moves below; this says *what* was moved to, for a screen
          reader that reports the region name only once. */}
      <p aria-live="polite" className="sr-only">
        {isLoggingIn ? "Log in" : `Step ${stepIndex + 1} of ${STEP_SEQUENCE.length}: ${STEP_LABELS[step]}`}
      </p>

      <main
        ref={stepRegion}
        tabIndex={-1}
        aria-label={isLoggingIn ? "Log in" : STEP_LABELS[step]}
        className="mt-6 outline-none"
      >
        {isLoggingIn ? (
          <GroupLogin
            itemCount={cart?.items.length ?? 0}
            onAuthenticated={() => {
              setIsLoggingIn(false);
              setMergeDismissed(false);
              // The account's cart is a different cart. Re-reading it is what
              // performs the merge and surfaces any decision it needs.
              void cartQuery.refetch();
              setStep("schedule");
            }}
            onCancel={() => setIsLoggingIn(false)}
          />
        ) : null}

        {visibleStep === "cart" ? (
          <section aria-labelledby="cart-heading">
            <h2 id="cart-heading" className="text-lg font-bold text-text">
              What you are booking
            </h2>

            {cartQuery.isPending ? (
              <div className="mt-4">
                <CartSkeleton />
              </div>
            ) : null}

            {cartQuery.isError && mergeConflict === null ? (
              <ErrorState
                className="mt-4"
                title="We could not load your booking"
                message={describeError(cartQuery.error, "read").message}
                actionLabel="Try again"
                onAction={() => void cartQuery.refetch()}
              />
            ) : null}

            {cart ? (
              <>
                <div className="mt-1">
                  <CartVersionNote cart={cart} />
                </div>

                <div className="mt-4">
                  <CartItems
                    cart={cart}
                    pendingItemIds={pendingItemId === null ? [] : [pendingItemId]}
                    onUpdateQuantity={({ item, quantity }: { item: CartItem; quantity: number }) => {
                      // One item's mutation touches one item. The id is recorded
                      // so only that row disables, and the command carries that
                      // row's own version — nothing else in the cart is read,
                      // sent or re-derived.
                      setPendingItemId(item.id);
                      updateItem.mutate(
                        {
                          itemId: item.id,
                          expectedCartVersion: cart.version,
                          expectedItemVersion: item.version,
                          quantity,
                          scope: item.scope,
                        },
                        { onSettled: () => setPendingItemId(null) },
                      );
                    }}
                    onRemove={null}
                    removalBoundary={REMOVAL_BOUNDARY}
                  />
                </div>

                {updateItem.isError ? (
                  <p className="mt-3 text-sm text-critical" role="alert">
                    {cartVersionConflict(updateItem.error) !== null
                      ? "Your booking changed somewhere else, so that edit was not applied. We have reloaded it — try again."
                      : describeError(updateItem.error, "mutation").message}
                  </p>
                ) : null}

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    onClick={() => requireSession("schedule")}
                    disabled={cart.items.length === 0}
                  >
                    Continue
                  </Button>
                  <Link
                    href="/catalog"
                    className={buttonStyles({ variant: "outline" })}
                  >
                    Add another service
                  </Link>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {visibleStep === "schedule" && cart ? (
          <section aria-labelledby="schedule-heading">
            <h2 id="schedule-heading" className="sr-only">
              Where and when
            </h2>

            <AddressStage
              addresses={addresses}
              isLoading={addressesQuery.isPending}
              serviceability={serviceabilityQuery.data ?? null}
              isCheckingServiceability={serviceabilityQuery.isFetching}
              selectedAddressId={addressId}
              onSelect={(address) => setAddressId(address.id)}
              onUseCurrentLocation={async () => {
                const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                  if (typeof navigator === "undefined" || !navigator.geolocation) {
                    reject(new Error("Location permission is not available."));
                    return;
                  }
                  navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    maximumAge: 30_000,
                    timeout: 12_000,
                  });
                });
                const resolved = await reverseGeocode.mutateAsync({
                  latitude: position.coords.latitude.toFixed(6),
                  longitude: position.coords.longitude.toFixed(6),
                });
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
                setAddressId(created.id);
              }}
              isUsingCurrentLocation={reverseGeocode.isPending || createAddress.isPending}
              onUpdateAddress={(id, patch) => updateAddress.mutate({ addressId: id, patch })}
              isUpdatingAddress={updateAddress.isPending}
            />

            {addressId !== null ? (
              <div className="mt-8 border-t border-line pt-6">
                <ScheduleStep
                  cart={cart}
                  windows={startsQuery.data}
                  isLoadingWindows={startsQuery.isPending}
                  windowsError={startsQuery.isError}
                  onRetryWindows={() => void startsQuery.refetch()}
                  selectedStart={preferredStart}
                  onSelectStart={setPreferredStart}
                  onContinue={handlePlan}
                  isPlanning={createPlanSet.isPending}
                  planFailures={planFailures}
                />
              </div>
            ) : null}

            {createPlanSet.isError && planFailures === null ? (
              <p className="mt-4 text-sm text-critical" role="alert">
                {describeError(createPlanSet.error, "mutation").message}
              </p>
            ) : null}

            <div className="mt-6">
              <Button variant="ghost" className="px-0" onClick={() => setStep("cart")}>
                Back to my booking
              </Button>
            </div>
          </section>
        ) : null}

        {visibleStep === "plans" && cart ? (
          <section aria-labelledby="plans-heading">
            <h2 id="plans-heading" className="sr-only">
              How we do it
            </h2>

            {planSet === null ? (
              planSetQuery.isError ? (
                <ErrorState
                  title="We could not load your options"
                  message={describeError(planSetQuery.error, "read").message}
                  actionLabel="Work out fresh options"
                  onAction={replan}
                />
              ) : (
                <CartSkeleton />
              )
            ) : (
              <>
                <PlanComparison
                  planSet={planSet}
                  cart={cart}
                  selectedPlanId={selectedPlanId}
                  isPricing={createQuote.isPending}
                  onSelect={setPlanChoice}
                  onContinue={handleQuote}
                  onReplan={replan}
                />

                {createQuote.isError ? (
                  <p className="mt-4 text-sm text-critical" role="alert">
                    {describeQuoteFailure(createQuote.error)}
                  </p>
                ) : null}
              </>
            )}

            <div className="mt-6">
              <Button variant="ghost" className="px-0" onClick={() => setStep("schedule")}>
                Change the time
              </Button>
            </div>
          </section>
        ) : null}

        {visibleStep === "review" ? (
          <section aria-labelledby="review-heading">
            <h2 id="review-heading" className="sr-only">
              Review
            </h2>

            {quote === null ? (
              <ErrorState
                severity="warning"
                title="We could not show this price"
                message={
                  quoteQuery.isError
                    ? describeError(quoteQuery.error, "read").message
                    : "Nothing has been booked or charged."
                }
                actionLabel="Go back to my booking"
                onAction={returnToCart}
              />
            ) : !isPlanSetUsable ? (
              // The quote itself may still read ACTIVE while the set it was
              // priced from has been withdrawn. Confirming from here would send
              // a quote Django has already stopped honouring.
              <ErrorState
                severity="warning"
                title="These options are no longer current"
                message="Your booking changed after this price was worked out, so it no longer describes what you are booking. Nothing has been booked or charged."
                actionLabel="Work out fresh options"
                onAction={replan}
              />
            ) : (
              <QuoteReview
                quote={quote}
                visitCount={
                  planSet?.plans.find((plan) => plan.id === quote.plan_id)?.visit_count ??
                  quote.units.length
                }
                professionalCount={
                  planSet?.plans.find((plan) => plan.id === quote.plan_id)
                    ?.professional_count ?? quote.units.length
                }
                isConfirming={createCheckout.isPending}
                errorMessage={
                  createCheckout.isError ? describeConfirmFailure(createCheckout.error) : null
                }
                onConfirm={handleConfirm}
                onBack={() => setStep("plans")}
                onStartOver={returnToCart}
              />
            )}
          </section>
        ) : null}

        {visibleStep === "confirmed" && checkout ? (
          <section aria-labelledby="confirmed-heading">
            <h2 id="confirmed-heading" className="sr-only">
              Confirmed
            </h2>
            <GroupResult checkout={checkout} />
          </section>
        ) : null}
      </main>

      <MergeDialog
        conflict={mergeConflict}
        isMerging={mergeCart.isPending}
        errorMessage={
          mergeCart.isError ? describeError(mergeCart.error, "mutation").message : null
        }
        onConfirm={(decisions) => {
          if (
            mergeConflict?.customerCartVersion == null ||
            mergeConflict.sessionCartVersion == null
          ) {
            return;
          }
          mergeCart.mutate(
            {
              expectedCustomerCartVersion: mergeConflict.customerCartVersion,
              expectedSessionCartVersion: mergeConflict.sessionCartVersion,
              decisions,
            },
            { onSuccess: () => setMergeDismissed(true) },
          );
        }}
        onRefresh={() => {
          mergeCart.reset();
          void cartQuery.refetch();
        }}
        onDismiss={() => setMergeDismissed(true)}
      />
    </div>
  );
}
