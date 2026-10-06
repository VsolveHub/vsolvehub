// Ported from frontend/apps/customer/features/checkout/view/checkout-workspace.tsx
// Exact match with Image 1 (previous customer portal) and web specification
import { describeError } from "@vsolve/query/native";
import { useAuthStore } from "@vsolve/mobile-core";
import { Button, Spinner, Text, formatMoney } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { useAddresses } from "@/features/addresses/queries";
import { useCustomerProfile } from "@/features/account/queries";
import { useServiceability } from "@/features/booking/queries";
import {
  useCart,
  useCreateCheckout,
  useCreatePlanQuote,
  useCreatePlanSet,
  usePlanQuote,
  usePlanSet,
  useSchedulingGroups,
} from "@/features/checkout/queries";
import { CustomerLoginSheet } from "@/features/session/customer-login-sheet";

import { AddressSheet } from "./address-sheet";
import { ChevronLeftIcon, ClockIcon, DetailRow, PhoneIcon, PinIcon } from "./detail-row";
import { OrderSummary } from "./order-summary";
import { SlotsSheet } from "./slots-sheet";

function formatChosen(startsAt: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(startsAt));
  } catch {
    return startsAt;
  }
}

/** Shield Checkmark Icon matching web SecureBookingBadge & CheckoutCancellationPanel */
function OrangeShieldIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke="#EA580C" strokeWidth={1.5}>
      <Path
        d="M10 2.5 4 5v5c0 3.5 2.6 6.8 6 7.5 3.4-.7 6-4 6-7.5V5l-6-2.5Z"
        strokeLinejoin="round"
      />
      <Path d="m7.5 10 1.75 1.75L12.5 8.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CheckoutScreen() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const [loginOpen, setLoginOpen] = useState(false);

  const profileQuery = useCustomerProfile(status === "signedIn");
  const cartQuery = useCart(status === "signedIn");
  const addressesQuery = useAddresses(status === "signedIn");

  const [addressId, setAddressId] = useState<string | null>(null);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [slotsSheetOpen, setSlotsSheetOpen] = useState(false);
  const [starts, setStarts] = useState<Record<string, string>>({});

  const [planSetId, setPlanSetId] = useState<string | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);

  const cart = cartQuery.data;
  const addresses = addressesQuery.data ?? [];
  const effectiveAddressId = addressId ?? addresses[0]?.id ?? null;
  const selectedAddress = addresses.find((a) => a.id === effectiveAddressId) ?? addresses[0] ?? null;

  const serviceabilityQuery = useServiceability({
    postalCode: selectedAddress?.postal_code ?? null,
    serviceVariantId: null,
  });

  const groupsQuery = useSchedulingGroups(
    cart && effectiveAddressId ? { cartVersion: cart.version, addressId: effectiveAddressId } : null,
  );
  const groups = groupsQuery.data ?? [];

  const createPlanSet = useCreatePlanSet();
  const createQuote = useCreatePlanQuote();
  const createCheckout = useCreateCheckout();

  const planSetQuery = usePlanSet(planSetId);
  const planSet = planSetQuery.data ?? null;
  const quoteQuery = usePlanQuote(quoteId);
  const quote = quoteQuery.data ?? null;

  const isScheduled = groups.length > 0 && groups.every((g) => starts[g.key] && starts[g.key].trim().length > 0);
  const isServiceable = serviceabilityQuery.data ? serviceabilityQuery.data.is_serviceable : true;

  function rescheduleFromScratch() {
    setPlanSetId(null);
    setQuoteId(null);
    setStarts({});
    createPlanSet.reset();
    createQuote.reset();
    createCheckout.reset();
    void groupsQuery.refetch();
  }

  function handleSchedule(chosen: Record<string, string>) {
    setStarts(chosen);
    if (!cart || !effectiveAddressId) return;

    const preferredStarts = Object.entries(chosen).map(([groupKey, startsAt]) => ({
      groupKey,
      startsAt,
    }));

    createPlanSet.mutate(
      {
        cartVersion: cart.version,
        addressId: effectiveAddressId,
        preferredStarts,
      },
      {
        onSuccess: (result) => {
          setPlanSetId(result.id);
          const recommended = result.plans.find((p) => p.is_recommended) ?? result.plans[0];
          if (!recommended) return;
          createQuote.mutate(recommended.id, {
            onSuccess: (priced) => setQuoteId(priced.id),
          });
        },
      },
    );
  }

  function handleConfirmBooking() {
    if (quote) {
      createCheckout.mutate(quote.id, {
        onSuccess: (result) => {
          const groupId = result.booking_group?.id;
          if (groupId) {
            router.replace(`/bookings/${groupId}` as never);
          } else {
            router.replace("/bookings" as never);
          }
        },
      });
      return;
    }

    if (!cart || !effectiveAddressId || !isScheduled) return;
    const preferredStarts = groups.map((g) => ({
      groupKey: g.key,
      startsAt: starts[g.key] ?? "",
    }));

    createPlanSet.mutate(
      {
        cartVersion: cart.version,
        addressId: effectiveAddressId,
        preferredStarts,
      },
      {
        onSuccess: (result) => {
          const chosen = result.plans.find((p) => p.is_recommended) ?? result.plans[0];
          if (!chosen) return;
          createQuote.mutate(chosen.id, {
            onSuccess: (priced) => {
              createCheckout.mutate(priced.id, {
                onSuccess: (created) => {
                  const groupId = created.booking_group?.id;
                  if (groupId) {
                    router.replace(`/bookings/${groupId}` as never);
                  } else {
                    router.replace("/bookings" as never);
                  }
                },
              });
            },
          });
        },
      },
    );
  }

  if (status === "signedOut") {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas px-6 py-12">
        <View className="w-full max-w-sm rounded-[1.5rem] border border-line bg-surface p-6 shadow-sm">
          <Text className="text-xl font-bold text-text">Sign in to checkout</Text>
          <Text className="mt-2 text-sm leading-relaxed text-text-secondary">
            Keep your saved cart, addresses, and track real-time technician assignments.
          </Text>
          <View className="mt-6">
            <Button size="lg" onPress={() => setLoginOpen(true)}>
              Log in / Sign up
            </Button>
          </View>
        </View>
        <CustomerLoginSheet open={loginOpen} onOpenChange={setLoginOpen} />
      </View>
    );
  }

  if (cartQuery.isSuccess && cart && cart.items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6 py-12">
        <View className="w-full max-w-sm rounded-[1.5rem] border border-line bg-surface p-6 text-center">
          <Text className="text-xl font-bold text-text">Your cart is empty</Text>
          <Text className="mt-2 text-sm leading-relaxed text-text-secondary">
            There is nothing to check out. Nothing has been booked or charged.
          </Text>
          <View className="mt-6">
            <Button size="lg" onPress={() => router.replace("/(tabs)" as never)}>
              Browse services
            </Button>
          </View>
        </View>
      </View>
    );
  }

  const isPricing = createPlanSet.isPending || createQuote.isPending;
  const isConfirming = createCheckout.isPending || isPricing;
  const phoneNumber = profileQuery.data?.phone_number ?? "+919640169854";

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4 py-4 pb-20"
        showsVerticalScrollIndicator={false}
      >
        {/* Top: Circular Back Button matching Image 1 */}
        <View className="pt-2">
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel="Back to cart"
            className="size-10 items-center justify-center rounded-full border border-line bg-surface shadow-xs active:bg-surface-sunken"
          >
            <ChevronLeftIcon />
          </Pressable>
        </View>

        {/* Page Title: "Checkout" (No subtitle in Image 1) */}
        <Text className="text-2xl font-bold tracking-tight text-navy-950">Checkout</Text>

        {/* Card 1: Details Card (Send booking details to, Address, Slot) */}
        <View className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
          {/* Phone */}
          <DetailRow
            icon={<PhoneIcon />}
            label="Send booking details to"
            isFirst
          >
            <Text className="text-sm font-normal text-text-secondary">{phoneNumber}</Text>
          </DetailRow>

          {/* Address */}
          <DetailRow
            icon={<PinIcon />}
            label="Address"
            actionLabel={selectedAddress ? "Edit" : "Add address"}
            actionVariant={selectedAddress ? "outline" : "primary"}
            onAction={() => setAddressSheetOpen(true)}
          >
            {selectedAddress ? (
              <View>
                <Text className="text-sm font-semibold text-text">
                  {selectedAddress.label}
                  <Text className="font-normal text-text-secondary">
                    {" — "}
                    {selectedAddress.line1}, {selectedAddress.locality}
                  </Text>
                </Text>
                {!isServiceable ? (
                  <Text className="mt-1 text-xs font-semibold text-danger-text">
                    ⚠️ Service not available in this pincode ({selectedAddress.postal_code})
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text className="text-sm text-text-secondary">Choose where the work happens.</Text>
            )}
          </DetailRow>

          {/* Slot */}
          <DetailRow
            icon={<ClockIcon />}
            label={groups.length > 1 ? "Slots" : "Slot"}
            actionLabel={
              !effectiveAddressId || groups.length === 0
                ? undefined
                : isScheduled
                ? "Edit"
                : "Select slots"
            }
            actionVariant="outline"
            onAction={() => {
              if (effectiveAddressId && groups.length > 0) {
                setSlotsSheetOpen(true);
              }
            }}
          >
            {!effectiveAddressId ? (
              <Text className="text-sm text-text-secondary">Pick an address first — times depend on area.</Text>
            ) : groupsQuery.isPending ? (
              <View className="flex-row items-center gap-2 py-1">
                <Spinner size="sm" />
                <Text className="text-xs text-text-secondary">Finding available slots...</Text>
              </View>
            ) : groupsQuery.isError ? (
              <View className="rounded-lg bg-critical-50 p-2.5">
                <Text className="text-xs font-semibold text-danger-text">
                  {describeError(groupsQuery.error, "read").message}
                </Text>
                <Pressable onPress={() => setAddressSheetOpen(true)} className="mt-1.5">
                  <Text className="text-xs font-bold text-accent">Change address &rarr;</Text>
                </Pressable>
              </View>
            ) : isScheduled ? (
              <View className="gap-1">
                {groups.map((group) => {
                  const startsAt = starts[group.key];
                  return (
                    <Text key={group.key} className="text-sm font-medium text-text">
                      {startsAt ? formatChosen(startsAt) : "No time chosen"}
                    </Text>
                  );
                })}
              </View>
            ) : (
              <Text className="text-sm text-text-secondary">No time chosen</Text>
            )}
          </DetailRow>
        </View>

        {/* Card 2: Confirm Booking Action Card matching Image 1 */}
        <View className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
          {quote !== null && quote.status === "ACTIVE" ? (
            <Button
              size="lg"
              loading={isConfirming}
              loadingLabel={isPricing ? "Working out your price" : "Confirming"}
              onPress={handleConfirmBooking}
            >
              Confirm booking
            </Button>
          ) : (
            <Pressable
              disabled={!isScheduled || isPricing}
              onPress={handleConfirmBooking}
              className="w-full items-center justify-center rounded-xl bg-[#E6E0D6] py-3.5"
            >
              <Text className="text-base font-semibold text-[#544D42]">
                {isPricing ? "Working out your price…" : "Confirm booking"}
              </Text>
            </Pressable>
          )}

          <Text className="mt-3 text-center text-sm text-text-secondary">
            You will pay after we have assigned your professionals.
          </Text>

          {quote === null && !isPricing ? (
            <Text className="mt-1.5 text-center text-sm text-text-secondary">
              Pick an address and a time for every visit to continue.
            </Text>
          ) : null}

          {/* Secure booking badge */}
          <View className="mt-4 flex-row items-start gap-2.5 pt-1">
            <View className="mt-0.5 size-9 items-center justify-center rounded-full bg-[#FFF4EB]">
              <OrangeShieldIcon />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-bold text-text">Secure booking</Text>
              <Text className="text-xs text-text-secondary">Your data is safe with us.</Text>
            </View>
          </View>
        </View>

        {/* Card 3: Cancellation policy matching Image 1 */}
        <View className="flex-row items-start gap-3 rounded-2xl border border-[#FDE6D5] bg-[#FFF7F0] p-4.5">
          <View className="mt-0.5 size-9 items-center justify-center rounded-full bg-[#FFE8D6]">
            <OrangeShieldIcon />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold text-text">Cancellation policy</Text>
            <Text className="mt-1 text-sm leading-relaxed text-text-secondary">
              Free cancellation before a professional is assigned. After that a fee may apply,
              depending on how close the visit is.
            </Text>
          </View>
        </View>

        {/* Card 4 & 5: Service item cards & Pricing Note in OrderSummary */}
        {cart ? <OrderSummary cart={cart} groups={groups} quote={quote} /> : null}

        {/* Errors display */}
        {createPlanSet.isError || createQuote.isError || createCheckout.isError ? (
          <View className="rounded-xl border border-danger-line bg-critical-50 p-3.5">
            <Text className="text-xs font-semibold text-danger-text">
              {describeError(createPlanSet.error ?? createQuote.error ?? createCheckout.error, "mutation").message}
            </Text>
            <Pressable onPress={rescheduleFromScratch} className="mt-2">
              <Text className="text-xs font-bold text-accent">Reset schedule & try again</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* Floating Bottom Bar ONLY when quote is active (Priced state) matching web mobile bottom bar */}
      {quote !== null && quote.status === "ACTIVE" ? (
        <View className="absolute bottom-0 left-0 right-0 border-t border-line bg-surface px-4 py-3.5 shadow-lg">
          <View className="flex-row items-baseline justify-between gap-3">
            <Text className="text-sm font-bold text-text">Amount to pay</Text>
            <Text className="text-xl font-bold tabular-nums text-text">
              {formatMoney(quote.total.amount_paise)}
            </Text>
          </View>
          <View className="mt-1 flex-row items-center justify-between">
            <Text className="text-xs text-text-secondary">Pay on completion</Text>
            <Button size="sm" loading={isConfirming} onPress={handleConfirmBooking}>
              Confirm booking
            </Button>
          </View>
        </View>
      ) : null}

      {/* Slots Sheet */}
      {cart && effectiveAddressId ? (
        <SlotsSheet
          open={slotsSheetOpen}
          onOpenChange={setSlotsSheetOpen}
          groups={groups}
          cartVersion={cart.version}
          addressId={effectiveAddressId}
          onConfirm={handleSchedule}
        />
      ) : null}

      {/* Address Sheet */}
      <AddressSheet
        open={addressSheetOpen}
        onOpenChange={setAddressSheetOpen}
        addresses={addresses}
        selectedAddressId={effectiveAddressId}
        onSelect={(id) => {
          setAddressId(id);
          setStarts({});
          setPlanSetId(null);
          setQuoteId(null);
        }}
      />

      {/* Auth Login Sheet */}
      <CustomerLoginSheet open={loginOpen} onOpenChange={setLoginOpen} />
    </View>
  );
}
