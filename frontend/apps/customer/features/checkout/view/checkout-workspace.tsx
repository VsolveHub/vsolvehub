"use client";

import { describeError } from "@vsolve/query";
import { Button, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  useAddresses,
  useCreateAddress,
  useReverseGeocode,
  useServiceability,
  useUpdateAddress,
} from "@/features/booking/queries";
import { AddressStage } from "@/features/booking/view/address-stage";
import { useCustomerSession } from "@/features/session/queries";

import {
  cartVersionConflict,
  isPlanStale,
  isQuoteExpired,
  isSchedulingGroupsChanged,
  planUnavailable,
  type PlanItemFailure,
} from "../conflicts";
import { describeConfirmFailure, describeItemFailure, describeQuoteFailure } from "../reasons";
import {
  useCandidateStarts,
  useCart,
  useCreateCheckout,
  useCreatePlanQuote,
  useCreatePlanSet,
  usePlanQuote,
  usePlanSet,
  useSchedulingGroups,
} from "../queries";
import { QuoteReview } from "./quote-review";
import { SlotsModal } from "./slots-modal";
import { formatServiceDuration } from "./duration";

/**
 * Checkout: where, when, what it costs, and one Confirm.
 *
 * ## Confirming is not paying
 *
 * The button says **Confirm booking** and charges nothing. Django's lifecycle is
 * assign-then-pay: `POST /checkouts/` creates the Booking Group and dispatches
 * offers, and payment only opens once every Partner has committed. Labelling
 * this Pay would be a promise the platform does not keep, and the sentence under
 * the button says so explicitly rather than leaving it to be discovered.
 *
 * ## Address before slots, always
 *
 * `POST /booking/windows/` and `POST /cart/scheduling-groups/` both resolve the
 * service area from the address. There is no meaningful set of visits or times
 * before one is chosen, so the slots modal cannot open earlier — and it opens by
 * itself the moment one is, because that is the next thing to do.
 *
 * ## Nothing here decides how the work is arranged
 *
 * Which services share a professional is `scheduling-groups`; how many visits a
 * plan needs is the plan set; every rupee is a server field. The plan
 * alternatives screen is gone: once each visit has a chosen time the grouping is
 * settled and the recommended plan is the answer, so it is selected and priced
 * without asking a question that no longer has two answers.
 */

export function CheckoutWorkspace() {
  const router = useRouter();
  const session = useCustomerSession();

  const [addressId, setAddressId] = useState<string | null>(null);
  /**
   * `null` means "nobody has decided" — the modal then follows the derived
   * default below. An explicit `true`/`false` is the customer opening or
   * dismissing it, and outranks that default until the visits change.
   */
  const [slotsOverride, setSlotsOverride] = useState<boolean | null>(null);
  const [chosenStarts, setChosenStarts] = useState<ReadonlyMap<string, string>>(new Map());
  const [planSetId, setPlanSetId] = useState<string | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [planFailures, setPlanFailures] = useState<PlanItemFailure[] | null>(null);

  const cartQuery = useCart();
  const cart = cartQuery.data;

  const addressesQuery = useAddresses(session.isAuthenticated);
  const addresses = addressesQuery.data ?? [];
  const selectedAddress = addresses.find((address) => address.id === addressId) ?? null;

  const reverseGeocode = useReverseGeocode();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();

  const serviceabilityQuery = useServiceability({
    postalCode: selectedAddress?.postal_code ?? null,
    serviceVariantId: null,
  });

  /**
   * The visits to pick times for.
   *
   * Requested only once an address exists, and keyed by cart version as well —
   * a grouping computed for a two-service cart is not the answer for a
   * three-service one, and the `group_key`s it published would be refused.
   */
  const groupsQuery = useSchedulingGroups(
    cart && addressId !== null ? { cartVersion: cart.version, addressId } : null,
  );
  const groups = groupsQuery.data ?? [];

  const isScheduled = groups.length > 0 && groups.every((group) => chosenStarts.has(group.key));

  /**
   * The picker opens itself as soon as there is something to pick.
   *
   * Derived, not set from an effect. An effect would render the page once with
   * the modal shut and then again with it open, so the customer sees a flash of
   * the screen behind it — and the auto-open would have to be re-suppressed
   * every time the effect's dependencies changed. Reading it as a value means
   * "there are visits and none are scheduled" simply *is* the open state.
   */
  const slotsOpen = slotsOverride ?? (groups.length > 0 && chosenStarts.size === 0);

  /**
   * Candidate start times, fetched only while the picker is actually open.
   *
   * `VOLATILE_STATE` on the query means a cached list is a claim the server has
   * stopped standing behind, so asking before the modal opens would show times
   * that have moved on by the time anyone looks at them.
   */
  const startsQuery = useCandidateStarts(
    cart && addressId !== null && slotsOpen ? { cartVersion: cart.version, addressId } : null,
  );

  const createPlanSet = useCreatePlanSet();
  const createQuote = useCreatePlanQuote();
  const createCheckout = useCreateCheckout();

  const planSetQuery = usePlanSet(planSetId);
  const planSet = planSetQuery.data ?? null;
  const quoteQuery = usePlanQuote(quoteId);
  const quote = quoteQuery.data ?? null;

  /**
   * A plan set the server has stopped standing behind cannot stay selected.
   * Derived on render rather than corrected in an effect, so the intermediate
   * state where a withdrawn plan still offers a Confirm button cannot exist.
   */
  const isPlanSetUsable = planSet !== null && planSet.status === "ACTIVE";

  /** Discards everything derived from a schedule and asks for times again. */
  function rescheduleFromScratch() {
    setPlanSetId(null);
    setQuoteId(null);
    setPlanFailures(null);
    setChosenStarts(new Map());
    // Back to the derived default rather than an explicit open: with no chosen
    // times, "there are visits and none are scheduled" reopens the picker on its
    // own, and forcing it would re-open a modal the customer had dismissed if
    // this ever ran while a schedule was already complete.
    setSlotsOverride(null);
    createPlanSet.reset();
    createQuote.reset();
    createCheckout.reset();
    void groupsQuery.refetch();
  }

  function handleSchedule(starts: ReadonlyMap<string, string>) {
    setChosenStarts(starts);
    setSlotsOverride(false);
    if (!cart || addressId === null) return;
    setPlanFailures(null);
    createPlanSet.mutate(
      {
        cartVersion: cart.version,
        addressId,
        preferredStarts: [...starts].map(([groupKey, startsAt]) => ({ groupKey, startsAt })),
      },
      {
        onSuccess: (result) => {
          setPlanSetId(result.id);
          // The grouping is already settled by the chosen times, so there is no
          // second question to ask. The server's own recommendation is priced.
          const recommended = result.plans.find((plan) => plan.is_recommended) ?? result.plans[0];
          if (recommended === undefined) return;
          createQuote.mutate(recommended.id, {
            onSuccess: (priced) => setQuoteId(priced.id),
            onError: (error) => {
              if (isPlanStale(error) || cartVersionConflict(error) !== null) {
                rescheduleFromScratch();
              }
            },
          });
        },
        onError: (error) => {
          const failures = planUnavailable(error);
          if (failures !== null) setPlanFailures(failures);
          if (isSchedulingGroupsChanged(error)) rescheduleFromScratch();
          if (cartVersionConflict(error) !== null) router.push("/cart");
        },
      },
    );
  }

  function handleConfirm() {
    if (quote === null) return;
    createCheckout.mutate(quote.id, {
      onSuccess: (result) => {
        // The Booking Group is where the assignment wait and, later, payment
        // live. Nothing has been charged.
        //
        // A checkout without a group is the superseded single-item shape, which
        // this screen never produces; falling back to the list rather than
        // routing to `/bookings/undefined` keeps that impossible case honest.
        const groupId = result.booking_group?.id;
        router.push(groupId === undefined ? "/bookings" : `/bookings/${groupId}`);
      },
      onError: (error) => {
        if (isQuoteExpired(error)) void quoteQuery.refetch();
      },
    });
  }

  if (cartQuery.isSuccess && cart && cart.items.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
        <h1 className="text-xl font-bold text-text">Checkout</h1>
        <ErrorState
          className="mt-6"
          severity="warning"
          title="There is nothing to check out"
          message="Your cart is empty. Nothing has been booked or charged."
          actionLabel="Browse services"
          onAction={() => router.push("/catalog")}
        />
      </div>
    );
  }

  const isPricing = createPlanSet.isPending || createQuote.isPending;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <h1 className="text-xl font-bold text-text">Checkout</h1>

      <section aria-labelledby="address-heading" className="mt-6">
        <h2 id="address-heading" className="sr-only">
          Where
        </h2>
        <AddressStage
          addresses={addresses}
          isLoading={addressesQuery.isPending}
          serviceability={serviceabilityQuery.data ?? null}
          isCheckingServiceability={serviceabilityQuery.isFetching}
          selectedAddressId={addressId}
          onSelect={(address) => {
            setAddressId(address.id);
            // A different address is a different service area, so every time
            // chosen against the old grouping is meaningless now.
            setChosenStarts(new Map());
            setPlanSetId(null);
            setQuoteId(null);
            setSlotsOverride(null);
          }}
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
      </section>

      {addressId !== null ? (
        <section aria-labelledby="slots-heading" className="mt-8 border-t border-line pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="slots-heading" className="text-lg font-bold text-text">
              When should we come?
            </h2>
            {isScheduled ? (
              <Button size="sm" variant="outline" onClick={() => setSlotsOverride(true)}>
                Change times
              </Button>
            ) : null}
          </div>

          {groupsQuery.isPending ? (
            <Skeleton className="mt-4 h-24 w-full" />
          ) : groupsQuery.isError ? (
            <ErrorState
              className="mt-4"
              title="We could not work out your visits"
              message={describeError(groupsQuery.error, "read").message}
              actionLabel="Try again"
              onAction={() => void groupsQuery.refetch()}
            />
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {groups.map((group) => {
                const startsAt = chosenStarts.get(group.key) ?? null;
                return (
                  <li
                    key={group.key}
                    className="flex items-center justify-between gap-4 rounded-card border border-line p-4"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-text">{group.label}</p>
                      <p className="mt-0.5 text-sm text-text-secondary">
                        Approx. {formatServiceDuration(group.estimated_duration_minutes)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-medium text-text">
                      {startsAt === null ? "No time chosen" : formatChosen(startsAt)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          {groups.length > 1 ? (
            <p className="mt-3 text-sm text-text-secondary">
              These need different professionals, so each visit has its own time — and its own
              minimum visit charge.
            </p>
          ) : null}

          {!isScheduled && groups.length > 0 ? (
            <div className="mt-4">
              <Button onClick={() => setSlotsOverride(true)}>Select slots</Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {planFailures !== null && cart ? (
        <div className="mt-6 rounded-card border border-critical-200 bg-critical-50 p-4">
          <h3 className="text-sm font-semibold text-text">We could not arrange this booking</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Nothing has been booked or charged. Try a different time, or book these separately.
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {planFailures.map((failure, index) => {
              const item = cart.items.find((candidate) => candidate.id === failure.cartItemId);
              return (
                <li key={`${failure.cartItemId ?? "cart"}-${index}`}>
                  <span className="font-medium text-text">
                    {item ? item.service_name : "Your booking"}
                  </span>
                  <span className="block text-text-secondary">
                    {describeItemFailure(failure.reason)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={rescheduleFromScratch}>
              Choose different times
            </Button>
          </div>
        </div>
      ) : null}

      {createPlanSet.isError && planFailures === null ? (
        <p className="mt-4 text-sm text-critical" role="alert">
          {isSchedulingGroupsChanged(createPlanSet.error)
            ? "Your cart changed, so the times you picked no longer match. Nothing has been booked — choose your times again."
            : describeError(createPlanSet.error, "mutation").message}
        </p>
      ) : null}

      {createQuote.isError ? (
        <p className="mt-4 text-sm text-critical" role="alert">
          {describeQuoteFailure(createQuote.error)}
        </p>
      ) : null}

      {isPricing ? <Skeleton className="mt-8 h-48 w-full" /> : null}

      {quote !== null && !isPricing ? (
        <section aria-labelledby="review-heading" className="mt-8 border-t border-line pt-6">
          <h2 id="review-heading" className="text-lg font-bold text-text">
            Review
          </h2>

          {!isPlanSetUsable ? (
            <ErrorState
              className="mt-4"
              severity="warning"
              title="These options are no longer current"
              message="Your booking changed after this price was worked out, so it no longer describes what you are booking. Nothing has been booked or charged."
              actionLabel="Work out fresh options"
              onAction={rescheduleFromScratch}
            />
          ) : (
            <div className="mt-4">
              <QuoteReview
                quote={quote}
                visitCount={
                  planSet?.plans.find((plan) => plan.id === quote.plan_id)?.visit_count ??
                  quote.units.length
                }
                professionalCount={
                  planSet?.plans.find((plan) => plan.id === quote.plan_id)?.professional_count ??
                  quote.units.length
                }
                isConfirming={createCheckout.isPending}
                confirmLabel="Confirm booking"
                confirmNote="You will pay after we have assigned your professionals."
                errorMessage={
                  createCheckout.isError ? describeConfirmFailure(createCheckout.error) : null
                }
                onConfirm={handleConfirm}
                onBack={() => setSlotsOverride(true)}
                onStartOver={() => router.push("/cart")}
              />
            </div>
          )}
        </section>
      ) : null}

      <div className="mt-8">
        <Link href="/cart" className={buttonStyles({ variant: "ghost" })}>
          Back to cart
        </Link>
      </div>

      <SlotsModal
        open={slotsOpen}
        groups={groups}
        value={chosenStarts}
        windows={startsQuery.data}
        isLoadingWindows={startsQuery.isPending}
        windowsError={startsQuery.isError}
        onRetryWindows={() => void startsQuery.refetch()}
        onConfirm={handleSchedule}
        onDismiss={() => setSlotsOverride(false)}
      />
    </div>
  );
}

/**
 * The chosen instant in the reader's own locale.
 *
 * Presentation only — what is sent to Django is the untouched ISO string the
 * server published, never a value reconstructed from this label.
 */
function formatChosen(startsAt: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(startsAt));
}
