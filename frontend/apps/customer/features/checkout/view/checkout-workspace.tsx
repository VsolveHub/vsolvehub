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
import { useProfileCompletionGate } from "@/features/account/view/profile-completion-dialog";
import { useCustomerSession } from "@/features/session/queries";

import {
  cartVersionConflict,
  isPlanStale,
  isQuoteExpired,
  isSchedulingGroupsChanged,
  planUnavailable,
  type PlanItemFailure,
} from "../conflicts";
import {
  describeConfirmFailure,
  describeItemFailure,
  describePlanSetFailure,
  describeQuoteFailure,
} from "../reasons";
import {
  useCart,
  useCreateCheckout,
  useCreatePlanQuote,
  useCreatePlanSet,
  usePlanQuote,
  usePlanSet,
  useSchedulingGroups,
} from "../queries";
import { ClockIcon, DetailRow, PhoneIcon, PinIcon } from "./detail-row";
import { Money } from "./money";
import { OrderSummary } from "./order-summary";
import { QuoteStatusNotice } from "./quote-status-notice";
import { SlotsModal } from "./slots-modal";

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
  const profileGate = useProfileCompletionGate("booking");

  const [addressId, setAddressId] = useState<string | null>(null);
  /** Reopens the address picker for a row that is already filled in. */
  const [isEditingAddress, setIsEditingAddress] = useState(false);
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

  /** Turns a device fix into a saved address, then selects it. */
  async function handleUseCurrentLocation() {
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
    setIsEditingAddress(false);
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
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6">
      <h1 className="text-xl font-bold text-text">Checkout</h1>

      {/* Two rails on desktop, one column on a phone. The details rail leads
          because it is the only part with anything to do; the summary follows it
          on a phone so the price is read on the way to Confirm rather than after
          it. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="flex flex-col gap-6">
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            {session.phoneNumber === null ? null : (
              <DetailRow icon={<PhoneIcon />} label="Send booking details to" isFirst>
                {session.phoneNumber}
              </DetailRow>
            )}

            <DetailRow
              icon={<PinIcon />}
              label="Address"
              isFirst={session.phoneNumber === null}
              actionLabel={selectedAddress === null ? undefined : "Edit"}
              onAction={selectedAddress === null ? undefined : () => setIsEditingAddress(true)}
            >
              {selectedAddress === null ? (
                <span>Choose where the work happens.</span>
              ) : (
                <span>
                  <span className="font-medium text-text">{selectedAddress.label}</span>
                  {" — "}
                  {selectedAddress.line1}, {selectedAddress.locality}
                </span>
              )}
            </DetailRow>

            <DetailRow
              icon={<ClockIcon />}
              label={groups.length > 1 ? "Slots" : "Slot"}
              actionLabel={isScheduled ? "Edit" : undefined}
              onAction={isScheduled ? () => setSlotsOverride(true) : undefined}
            >
              {addressId === null ? (
                <span>Pick an address first — times depend on the area.</span>
              ) : groupsQuery.isPending ? (
                <Skeleton className="h-5 w-40" />
              ) : groupsQuery.isError ? (
                <span className="text-critical">
                  {describeError(groupsQuery.error, "read").message}
                </span>
              ) : (
                <ul className="flex flex-col gap-1">
                  {groups.map((group) => {
                    const startsAt = chosenStarts.get(group.key) ?? null;
                    return (
                      <li key={group.key}>
                        {groups.length > 1 ? (
                          <span className="font-medium text-text">{group.label}: </span>
                        ) : null}
                        {startsAt === null ? (
                          <span>No time chosen</span>
                        ) : (
                          <span className="text-text">{formatChosen(startsAt)}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </DetailRow>
          </div>

          {/* The address picker is a step until one is chosen, and stays
              reachable afterwards through the row's Edit control. */}
          {selectedAddress === null || isEditingAddress ? (
            <section
              aria-labelledby="address-heading"
              className="rounded-card border border-line bg-surface p-5"
            >
              <h2 id="address-heading" className="text-base font-bold text-text">
                Where should we come?
              </h2>
              <div className="mt-4">
                <AddressStage
                  addresses={addresses}
                  isLoading={addressesQuery.isPending}
                  serviceability={serviceabilityQuery.data ?? null}
                  isCheckingServiceability={serviceabilityQuery.isFetching}
                  selectedAddressId={addressId}
                  onSelect={(address) => {
                    setAddressId(address.id);
                    setIsEditingAddress(false);
                    // A different address is a different service area, so every
                    // time chosen against the old grouping is meaningless now.
                    setChosenStarts(new Map());
                    setPlanSetId(null);
                    setQuoteId(null);
                    setSlotsOverride(null);
                  }}
                  onUseCurrentLocation={handleUseCurrentLocation}
                  isUsingCurrentLocation={reverseGeocode.isPending || createAddress.isPending}
                  onUpdateAddress={(id, patch) => updateAddress.mutate({ addressId: id, patch })}
                  isUpdatingAddress={updateAddress.isPending}
                />
              </div>
            </section>
          ) : null}

          {addressId !== null && groups.length > 0 && !isScheduled ? (
            <div>
              <Button onClick={() => setSlotsOverride(true)}>Select slots</Button>
            </div>
          ) : null}

          {planFailures !== null && cart ? (
            <div className="rounded-card border border-critical-200 bg-critical-50 p-5">
              <h2 className="text-sm font-semibold text-text">
                We could not arrange this booking
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Nothing has been booked or charged. Try a different time, or book these
                separately.
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
            <p className="text-sm text-critical" role="alert">
              {isSchedulingGroupsChanged(createPlanSet.error)
                ? "Your cart changed, so the times you picked no longer match. Nothing has been booked — choose your times again."
                : describeError(createPlanSet.error, "mutation").message}
            </p>
          ) : null}

          {createQuote.isError ? (
            <p className="text-sm text-critical" role="alert">
              {describeQuoteFailure(createQuote.error)}
            </p>
          ) : null}

          {/* Confirm sits under the amount so the number is on screen at the
              moment of the decision, on every width. */}
          <div className="rounded-card border border-line bg-surface p-5">
            {quote !== null && isPlanSetUsable && quote.status === "ACTIVE" ? (
              <div className="flex items-baseline justify-between gap-3 border-b border-line pb-4">
                <span className="text-sm font-semibold text-text">Amount to pay</span>
                <Money value={quote.total} className="text-xl font-bold tabular-nums text-text" />
              </div>
            ) : null}

            {quote !== null && !isPlanSetUsable ? (
              <ErrorState
                severity="warning"
                title="These options are no longer current"
                message={describePlanSetFailure(planSet)}
                actionLabel="Work out fresh options"
                onAction={rescheduleFromScratch}
              />
            ) : quote !== null && quote.status !== "ACTIVE" ? (
              // A withheld Confirm without a reason is the version of this
              // screen that generates support tickets.
              <QuoteStatusNotice quote={quote} onStartOver={rescheduleFromScratch} />
            ) : (
              <div className={quote === null ? "" : "mt-4"}>
                <Button
                  className="w-full"
                  disabled={quote === null || quote.status !== "ACTIVE"}
                  loading={createCheckout.isPending || isPricing}
                  loadingLabel={isPricing ? "Working out your price" : "Confirming"}
                  onClick={() => profileGate.run(handleConfirm)}
                >
                  Confirm booking
                </Button>

                {/* Load-bearing. Django's lifecycle is assign-then-pay, so
                    confirming dispatches offers and charges nothing. Without
                    this sentence the button reads as the end of the flow. */}
                <p className="mt-3 text-center text-sm text-text-secondary">
                  You will pay after we have assigned your professionals.
                </p>

                {quote === null && !isPricing ? (
                  <p className="mt-2 text-center text-sm text-text-secondary" aria-live="polite">
                    Pick an address and a time for every visit to continue.
                  </p>
                ) : null}

                {createCheckout.isError ? (
                  <p className="mt-3 text-sm text-critical" role="alert">
                    {describeConfirmFailure(createCheckout.error)}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <section aria-labelledby="cancellation-heading">
            <h2 id="cancellation-heading" className="text-base font-bold text-text">
              Cancellation policy
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Free cancellation before a professional is assigned. After that a fee may apply,
              depending on how close the visit is.
              {quote !== null && quote.units.length > 1
                ? " Each visit has its own terms, because each one is a separate appointment."
                : ""}
            </p>
          </section>
        </div>

        <aside aria-labelledby="summary-heading" className="lg:sticky lg:top-6">
          <h2 id="summary-heading" className="sr-only">
            Order summary
          </h2>
          {cart ? <OrderSummary cart={cart} groups={groups} quote={quote} /> : null}

          <div className="mt-4">
            <Link href="/cart" className={buttonStyles({ variant: "ghost" })}>
              Back to cart
            </Link>
          </div>
        </aside>
      </div>

      <SlotsModal
        open={slotsOpen}
        groups={groups}
        value={chosenStarts}
        cartVersion={cart?.version ?? 0}
        addressId={addressId ?? ""}
        onConfirm={handleSchedule}
        onDismiss={() => setSlotsOverride(false)}
      />
      {profileGate.dialog}
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
