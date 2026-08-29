"use client";

import type { Schemas } from "@vsolve/api-client";
import { describeError } from "@vsolve/query";
import { Button, Dialog, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  useAddresses,
  useCreateAddress,
  useReverseGeocode,
  useServiceability,
  useUpdateAddress,
} from "@/features/booking/queries";
import { preferredAddressId } from "@/features/addresses/queries";
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
  type GroupQuote,
  type PlanSet,
} from "../queries";
import {
  CHECKOUT_GRID_CLASS,
  CHECKOUT_PAGE_BG,
  CHECKOUT_PAGE_FRAME,
  CHECKOUT_SIDEBAR_STICKY_CLASS,
} from "./checkout-layout";
import { ConfirmBookingIllustration } from "./checkout-illustrations";
import {
  CheckoutCancellationPanel,
  CheckoutCard,
  CheckoutSectionHeading,
  SecureBookingBadge,
  checkoutCardClass,
} from "./checkout-section";
import { ClockIcon, DetailRow, PhoneIcon, PinIcon } from "./detail-row";
import { OrderSummary } from "./order-summary";
import { CheckoutMobileBottomBar } from "./checkout-mobile-bottom-bar";
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

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const phoneNumber = mounted ? session.phoneNumber : null;

  const [addressId, setAddressId] = useState<string | null>(null);
  /** Reopens the address picker for a row that is already filled in. */
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  /**
   * `null` means "nobody has decided" — the modal then follows the derived
   * default below. An explicit `true`/`false` is the customer opening or
   * dismissing it, and outranks that default until the visits change.
   */
  const [slotsOverride, setSlotsOverride] = useState<boolean | null>(null);
  const [chosenStarts, setChosenStarts] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const [planSetId, setPlanSetId] = useState<string | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [planFailures, setPlanFailures] = useState<PlanItemFailure[] | null>(
    null,
  );

  const cartQuery = useCart();
  const cart = cartQuery.data;

  const addressesQuery = useAddresses(session.isAuthenticated);
  const addresses = addressesQuery.data ?? [];
  const effectiveAddressId = preferredAddressId(addresses, addressId);
  const selectedAddress =
    addresses.find((address) => address.id === effectiveAddressId) ?? null;

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
    cart && effectiveAddressId !== null
      ? { cartVersion: cart.version, addressId: effectiveAddressId }
      : null,
  );
  const groups = groupsQuery.data ?? [];

  const isScheduled =
    groups.length > 0 && groups.every((group) => chosenStarts.has(group.key));

  /**
   * The picker opens itself as soon as there is something to pick.
   *
   * Derived, not set from an effect. An effect would render the page once with
   * the modal shut and then again with it open, so the customer sees a flash of
   * the screen behind it — and the auto-open would have to be re-suppressed
   * every time the effect's dependencies changed. Reading it as a value means
   * "there are visits and none are scheduled" simply *is* the open state.
   */
  const slotsOpen =
    slotsOverride ?? (groups.length > 0 && chosenStarts.size === 0);

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
    if (!cart || effectiveAddressId === null) return;
    setPlanFailures(null);
    createPlanSet.mutate(
      {
        cartVersion: cart.version,
        addressId: effectiveAddressId,
        preferredStarts: [...starts].map(([groupKey, startsAt]) => ({
          groupKey,
          startsAt,
        })),
      },
      {
        onSuccess: (result) => {
          setPlanSetId(result.id);
          // The grouping is already settled by the chosen times, so there is no
          // second question to ask. The server's own recommendation is priced.
          const recommended =
            result.plans.find((plan) => plan.is_recommended) ?? result.plans[0];
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

  const [locationError, setLocationError] = useState<string | null>(null);
  const [draftPostalCode, setDraftPostalCode] = useState("");
  const draftServiceabilityQuery = useServiceability({
    postalCode: draftPostalCode.trim().length === 6 ? draftPostalCode.trim() : null,
    serviceVariantId: null,
  });

  async function locate(): Promise<Schemas["ReverseGeocodeResponse"] | null> {
    setLocationError(null);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          reject(new Error("Location permission is not available on this device."));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 30_000,
          timeout: 12_000,
        });
      });
      return await reverseGeocode.mutateAsync({
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
      });
    } catch {
      setLocationError(
        "We could not find you. Check location permission for this site and try again.",
      );
      return null;
    }
  }

  async function create(
    request: Schemas["AddressRequest"],
  ): Promise<Schemas["Address"] | null> {
    try {
      const created = await createAddress.mutateAsync({
        ...request,
        is_default: addresses.length === 0,
      });
      setAddressId(created.id);
      setIsEditingAddress(false);
      setChosenStarts(new Map());
      setPlanSetId(null);
      setQuoteId(null);
      setSlotsOverride(null);
      return created;
    } catch {
      return null;
    }
  }

  /** Turns a device fix into a saved address, then selects it. */
  async function handleUseCurrentLocation() {
    const resolved = await locate();
    if (!resolved) return;
    await create({
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
    });
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
        router.push(
          groupId === undefined ? "/bookings" : `/bookings/${groupId}`,
        );
      },
      onError: (error) => {
        if (isQuoteExpired(error)) void quoteQuery.refetch();
      },
    });
  }

  if (cartQuery.isSuccess && cart && cart.items.length === 0) {
    return (
      <div className={`${CHECKOUT_PAGE_BG} min-h-full py-10`}>
        <div className={`${CHECKOUT_PAGE_FRAME} w-full max-w-3xl pb-16`}>
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
      </div>
    );
  }

  const isPricing = createPlanSet.isPending || createQuote.isPending;

  return (
    <div className={`${CHECKOUT_PAGE_BG} min-h-full py-6`}>
      <div className={`${CHECKOUT_PAGE_FRAME} pb-[calc(6rem+env(safe-area-inset-bottom,0px))] lg:pb-24`}>
        <h1 className="text-xl font-bold text-text">Checkout</h1>

        {/* Two rails on desktop, one column on a phone. The details rail leads
            because it is the only part with anything to do; the summary follows it
            on a phone so the price is read on the way to Confirm rather than after
            it. */}
        <div className={`mt-6 ${CHECKOUT_GRID_CLASS}`}>
          <div className="flex flex-col gap-6">
            <div className={`overflow-hidden ${checkoutCardClass}`}>
              {phoneNumber === null ? null : (
                <DetailRow
                  icon={<PhoneIcon />}
                  label="Send booking details to"
                  isFirst
                >
                  {phoneNumber}
                </DetailRow>
              )}

              <DetailRow
                icon={<PinIcon />}
                label="Address"
                isFirst={phoneNumber === null}
                actionLabel={selectedAddress === null ? undefined : "Edit"}
                onAction={
                  selectedAddress === null
                    ? undefined
                    : () => setIsEditingAddress(true)
                }
              >
                {selectedAddress === null ? (
                  <span>Choose where the work happens.</span>
                ) : (
                  <div>
                    <span>
                      <span className="font-medium text-text">
                        {selectedAddress.label}
                      </span>
                      {" — "}
                      {selectedAddress.line1}, {selectedAddress.locality}
                    </span>
                    {serviceabilityQuery.data && !serviceabilityQuery.data.is_serviceable ? (
                      <span className="mt-1.5 block text-xs font-semibold text-critical">
                        ⚠️ Service not available in this pincode ({selectedAddress.postal_code})
                      </span>
                    ) : null}
                  </div>
                )}
              </DetailRow>

              <DetailRow
                icon={<ClockIcon />}
                label={groups.length > 1 ? "Slots" : "Slot"}
                actionLabel={
                  effectiveAddressId === null || groups.length === 0 || groupsQuery.isError
                    ? undefined
                    : isScheduled
                      ? "Edit"
                      : "Select slots"
                }
                onAction={
                  effectiveAddressId === null || groups.length === 0 || groupsQuery.isError
                    ? undefined
                    : () => setSlotsOverride(true)
                }
              >
                {effectiveAddressId === null ? (
                  <span>Pick an address first — times depend on the area.</span>
                ) : groupsQuery.isPending ? (
                  <Skeleton className="h-5 w-40" />
                ) : groupsQuery.isError ? (
                  <div className="mt-1 rounded-xl border border-critical/20 bg-critical-surface/30 p-3 text-xs text-text-secondary">
                    <p className="font-semibold text-critical">
                      {describeError(groupsQuery.error, "read").message}
                    </p>
                    <p className="mt-1 leading-relaxed">
                      We do not currently have verified technicians covering this address ({selectedAddress?.postal_code ?? ""}) for all selected services. Please choose a different address in Hyderabad.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsEditingAddress(true)}
                      className="mt-2.5 inline-flex items-center gap-1 font-bold text-action hover:underline cursor-pointer"
                    >
                      Change address &rarr;
                    </button>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {groups.map((group) => {
                      const startsAt = chosenStarts.get(group.key) ?? null;
                      return (
                        <li key={group.key}>
                          {groups.length > 1 ? (
                            <span className="font-medium text-text">
                              {group.label}:{" "}
                            </span>
                          ) : null}
                          {startsAt === null ? (
                            <span>No time chosen</span>
                          ) : (
                            <span className="text-text">
                              {formatChosen(startsAt)}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </DetailRow>

              <div className="hidden border-t border-line px-5 py-3.5 lg:block">
                <Link href="/cart" className={buttonStyles({ variant: "ghost" })}>
                  Back to cart
                </Link>
              </div>
            </div>

            {/* The address picker is a step until one is chosen, and opens
              as a modal popup when the row's Edit control is clicked. */}
            {selectedAddress === null ? (
              <section className={`${checkoutCardClass} p-5`}>
                <CheckoutSectionHeading
                  number={1}
                  title="Where should we come?"
                />
                <div className="mt-4">
                  <AddressStage
                    addresses={addresses}
                    isLoading={addressesQuery.isPending}
                    serviceability={serviceabilityQuery.data ?? null}
                    isCheckingServiceability={serviceabilityQuery.isFetching}
                    selectedAddressId={effectiveAddressId}
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
                    isUsingCurrentLocation={
                      reverseGeocode.isPending || createAddress.isPending
                    }
                    locationError={locationError}
                    onUpdateAddress={(id, patch) =>
                      updateAddress.mutate({ addressId: id, patch })
                    }
                    isUpdatingAddress={updateAddress.isPending}
                    addNew={{
                      onLocate: locate,
                      isLocating: reverseGeocode.isPending,
                      locateError: locationError,
                      onCreate: create,
                      isCreating: createAddress.isPending,
                      createError:
                        createAddress.error === null
                          ? null
                          : describeError(createAddress.error, "mutation").message,
                      onPostalCodeChange: setDraftPostalCode,
                      draftServiceability: draftServiceabilityQuery.data ?? null,
                      isCheckingDraftServiceability: draftServiceabilityQuery.isFetching,
                    }}
                  />
                </div>
              </section>
            ) : null}

            {/* Address Edit Modal Popup */}
            <Dialog
              open={isEditingAddress}
              onOpenChange={setIsEditingAddress}
              title="Select Service Address"
            >
              <div className="mt-2">
                <AddressStage
                  addresses={addresses}
                  isLoading={addressesQuery.isPending}
                  serviceability={serviceabilityQuery.data ?? null}
                  isCheckingServiceability={serviceabilityQuery.isFetching}
                  selectedAddressId={effectiveAddressId}
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
                  isUsingCurrentLocation={
                    reverseGeocode.isPending || createAddress.isPending
                  }
                  locationError={locationError}
                  onUpdateAddress={(id, patch) =>
                    updateAddress.mutate({ addressId: id, patch })
                  }
                  isUpdatingAddress={updateAddress.isPending}
                  addNew={{
                    onLocate: locate,
                    isLocating: reverseGeocode.isPending,
                    locateError: locationError,
                    onCreate: create,
                    isCreating: createAddress.isPending,
                    createError:
                      createAddress.error === null
                        ? null
                        : describeError(createAddress.error, "mutation").message,
                    onPostalCodeChange: setDraftPostalCode,
                    draftServiceability: draftServiceabilityQuery.data ?? null,
                    isCheckingDraftServiceability: draftServiceabilityQuery.isFetching,
                  }}
                />
              </div>
            </Dialog>

            {planFailures !== null && cart ? (
              <div className="rounded-card border border-critical-200 bg-critical-50 p-5">
                <h2 className="text-sm font-semibold text-text">
                  We could not arrange this booking
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Nothing has been booked or charged. Try a different time, or
                  book these separately.
                </p>
                <ul className="mt-3 flex flex-col gap-2 text-sm">
                  {planFailures.map((failure, index) => {
                    const item = cart.items.find(
                      (candidate) => candidate.id === failure.cartItemId,
                    );
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={rescheduleFromScratch}
                  >
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

            {/* Confirm on mobile only — desktop lives in the summary rail. */}
            <CheckoutCard className="flex items-start gap-4 p-5 lg:hidden">
              <ConfirmBookingActions
                quote={quote}
                isPlanSetUsable={isPlanSetUsable}
                planSet={planSet}
                isPricing={isPricing}
                createCheckout={createCheckout}
                onConfirm={() => profileGate.run(handleConfirm)}
                onReschedule={rescheduleFromScratch}
              />
              <ConfirmBookingIllustration />
            </CheckoutCard>

            <CheckoutCancellationPanel
              quoteUnitCount={quote?.units.length ?? 0}
            />
          </div>

          <aside
            aria-labelledby="summary-heading"
            className={CHECKOUT_SIDEBAR_STICKY_CLASS}
          >
            <h2 id="summary-heading" className="sr-only">
              Order summary
            </h2>
            {cart ? (
              <OrderSummary cart={cart} groups={groups} quote={quote} />
            ) : null}

            <div className="mt-4 hidden lg:block">
              <ConfirmBookingActions
                quote={quote}
                isPlanSetUsable={isPlanSetUsable}
                planSet={planSet}
                isPricing={isPricing}
                createCheckout={createCheckout}
                onConfirm={() => profileGate.run(handleConfirm)}
                onReschedule={rescheduleFromScratch}
              />
            </div>
          </aside>
        </div>

        <SlotsModal
          open={slotsOpen}
          groups={groups}
          value={chosenStarts}
          cartVersion={cart?.version ?? 0}
          addressId={effectiveAddressId ?? ""}
          onConfirm={handleSchedule}
          onDismiss={() => setSlotsOverride(false)}
        />
        {profileGate.dialog}
        <CheckoutMobileBottomBar quote={quote} />
      </div>
    </div>
  );
}

function ConfirmBookingActions({
  quote,
  isPlanSetUsable,
  planSet,
  isPricing,
  createCheckout,
  onConfirm,
  onReschedule,
}: {
  quote: GroupQuote | null;
  isPlanSetUsable: boolean;
  planSet: PlanSet | null;
  isPricing: boolean;
  createCheckout: ReturnType<typeof useCreateCheckout>;
  onConfirm: () => void;
  onReschedule: () => void;
}) {
  if (quote !== null && !isPlanSetUsable) {
    return (
      <ErrorState
        severity="warning"
        title="These options are no longer current"
        message={describePlanSetFailure(planSet)}
        actionLabel="Work out fresh options"
        onAction={onReschedule}
      />
    );
  }

  if (quote !== null && quote.status !== "ACTIVE") {
    return <QuoteStatusNotice quote={quote} onStartOver={onReschedule} />;
  }

  return (
    <div className="min-w-0 flex-1">
      <Button
        className="w-full"
        disabled={quote === null || quote.status !== "ACTIVE"}
        loading={createCheckout.isPending || isPricing}
        loadingLabel={isPricing ? "Working out your price" : "Confirming"}
        onClick={onConfirm}
      >
        Confirm booking
      </Button>

      <p className="mt-3 text-center text-sm text-text-secondary lg:text-left">
        You will pay after we have assigned your professionals.
      </p>

      {quote === null && !isPricing ? (
        <p
          className="mt-2 text-center text-sm text-text-secondary lg:text-left"
          aria-live="polite"
        >
          Pick an address and a time for every visit to continue.
        </p>
      ) : null}

      {createCheckout.isError ? (
        <p className="mt-3 text-sm text-critical" role="alert">
          {describeConfirmFailure(createCheckout.error)}
        </p>
      ) : null}

      <SecureBookingBadge className="mt-4" />
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
