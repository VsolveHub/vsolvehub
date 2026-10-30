// Ported from frontend/apps/customer/features/checkout/view/checkout-workspace.tsx
// Exact match with Image 1 (previous customer portal) and web specification
import { describeError } from "@vsolve/query/native";
import { useAuthStore } from "@vsolve/mobile-core";
import { Button, Spinner, Text, formatMoney } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { useAddresses } from "@/features/addresses/queries";
import { useCustomerProfile } from "@/features/account/queries";
import { useServiceability } from "@/features/booking/queries";
import { cartMergeConflict, cartVersionConflict } from "@/features/checkout/conflicts";
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

import { Image } from "expo-image";
import { resolveImageUrl } from "@/features/catalog/category-artwork";
import { useServiceDetail } from "@/features/catalog/client-queries";
import { AddressSheet } from "./address-sheet";
import { ChevronLeftIcon, ClockIcon, DetailRow, PhoneIcon, PinIcon } from "./detail-row";
import { OrderSummary } from "./order-summary";
import { SlotsSheet } from "./slots-sheet";
import { useIsDesktop } from "@/lib/responsive";
import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";

function CheckoutItemCover({ slug }: { slug: string }) {
  const detail = useServiceDetail(slug);
  const imageUrl = resolveImageUrl(detail.data?.cover?.url);

  if (!imageUrl) {
    return (
      <View className="size-full items-center justify-center bg-[#F4F1EC]">
        <Text className="text-xs font-bold text-[#94A3B8]">VS</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: imageUrl }}
      contentFit={
        imageUrl.includes("/Service Cover/") || imageUrl.includes("/Service%20Cover/")
          ? "contain"
          : "cover"
      }
      style={{ width: "100%", height: "100%" }}
    />
  );
}

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
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const [loginOpen, setLoginOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const isAddressKnownUnserviceable = Boolean(
    serviceabilityQuery.data && !serviceabilityQuery.data.is_serviceable,
  );

  const hasItems = Boolean(cart && cart.items && cart.items.length > 0);

  const groupsQuery = useSchedulingGroups(
    hasItems && effectiveAddressId && !isAddressKnownUnserviceable
      ? { cartVersion: cart!.version, addressId: effectiveAddressId }
      : null,
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
            onError: (err) => {
              if (cartVersionConflict(err) !== null) {
                rescheduleFromScratch();
              }
            },
          });
        },
        onError: (err) => {
          if (cartVersionConflict(err) !== null) {
            rescheduleFromScratch();
          }
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
            onError: (err) => {
              if (cartVersionConflict(err) !== null) {
                rescheduleFromScratch();
              }
            },
          });
        },
        onError: (err) => {
          if (cartVersionConflict(err) !== null) {
            rescheduleFromScratch();
          }
        },
      },
    );
  }

  if (status === "signedOut") {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas px-6 py-12">
        <View className="w-full max-w-sm rounded-[1.5rem] border border-line bg-surface p-6 shadow-sm">
          <Pressable
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/cart" as never);
              }
            }}
            accessibilityLabel="Back to cart"
            className="mb-4 size-10 items-center justify-center rounded-full border border-line bg-surface shadow-xs active:bg-surface-sunken"
          >
            <ChevronLeftIcon />
          </Pressable>
          <Text className="text-xl font-bold text-text">Sign in to checkout</Text>
          <Text className="mt-2 text-sm leading-relaxed text-text-secondary">
            Keep your saved cart, addresses, and track real-time technician assignments.
          </Text>
          <View className="mt-6 gap-2.5">
            <Button size="lg" onPress={() => setLoginOpen(true)}>
              Log in / Sign up
            </Button>
            <Button
              variant="outline"
              size="lg"
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace("/cart" as never);
                }
              }}
            >
              Return to cart
            </Button>
          </View>
        </View>
        <CustomerLoginSheet open={loginOpen} onOpenChange={setLoginOpen} />
      </View>
    );
  }

  if (cartQuery.isSuccess && cart && cart.items.length === 0) {
    if (isDesktop) {
      return (
        <ScrollView className="flex-1 bg-[#FAF9F7]" contentContainerClassName="pb-0">
          <View className="mx-auto w-full max-w-[1216px] px-6 lg:px-8 pt-8 pb-16 min-h-[calc(100vh-180px)]">
            <Text className="text-[2.5rem] font-extrabold leading-[1.15] tracking-tight text-[#0B1B3D]">
              Checkout
            </Text>
            <View className="mt-8 rounded-2xl border border-[#F1EFEB] bg-white p-12 items-center justify-center shadow-xs">
              <Text className="text-xl font-bold text-[#0B1B3D]">Your cart is empty</Text>
              <Text className="mt-2 text-sm leading-relaxed text-[#64748B]">
                There is nothing to check out. Nothing has been booked or charged.
              </Text>
              <View className="mt-6">
                <Button size="lg" onPress={() => router.replace("/catalog" as never)} className="bg-[#EA580C]">
                  Browse services
                </Button>
              </View>
            </View>
          </View>
          <DesktopSiteFooter />
        </ScrollView>
      );
    }

    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6 py-12">
        <View className="w-full max-w-sm rounded-[1.5rem] border border-line bg-surface p-6 text-center">
          <Pressable
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/cart" as never);
              }
            }}
            accessibilityLabel="Back to cart"
            className="mb-4 size-10 items-center justify-center rounded-full border border-line bg-surface shadow-xs active:bg-surface-sunken"
          >
            <ChevronLeftIcon />
          </Pressable>
          <Text className="text-xl font-bold text-text">Your cart is empty</Text>
          <Text className="mt-2 text-sm leading-relaxed text-text-secondary">
            There is nothing to check out. Nothing has been booked or charged.
          </Text>
          <View className="mt-6">
            <Button size="lg" onPress={() => router.replace("/catalog" as never)}>
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

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([profileQuery.refetch(), cartQuery.refetch(), addressesQuery.refetch()]);
    setRefreshing(false);
  };

  if (isDesktop) {
    return (
      <View className="flex-1 bg-[#FAF9F7]">
        <ScrollView
          className="flex-1 bg-[#FAF9F7]"
          contentContainerClassName="pb-0"
          showsVerticalScrollIndicator={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
          }
        >
          <View className="mx-auto w-full max-w-[1216px] px-6 lg:px-8 pt-8 pb-16 min-h-[calc(100vh-180px)]">
            {/* Title matching Image 3 */}
            <Text className="text-[2.5rem] font-extrabold leading-[1.15] tracking-tight text-[#0B1B3D]">
              Checkout
            </Text>

            {/* 2-Column Desktop Grid */}
            <View className="mt-8 flex-row items-start gap-8">
              {/* Left Column: Details Card + Cancellation policy */}
              <View className="min-w-0 flex-1">
                {/* Details Card */}
                <View className="overflow-hidden rounded-2xl border border-[#F1EFEB] bg-white shadow-xs">
                  {/* Phone Row */}
                  <View className="flex-row items-center justify-between p-5">
                    <View className="flex-row items-center gap-3.5 min-w-0 flex-1">
                      <PhoneIcon />
                      <View className="min-w-0 flex-1">
                        <Text className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                          Send booking details to
                        </Text>
                        <Text className="mt-1 text-sm font-bold text-[#0B1B3D]">{phoneNumber}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Address Row */}
                  <View className="border-t border-[#F1EFEB] flex-row items-center justify-between p-5">
                    <View className="flex-row items-center gap-3.5 min-w-0 flex-1 mr-4">
                      <PinIcon />
                      <View className="min-w-0 flex-1">
                        <Text className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Address</Text>
                        {selectedAddress ? (
                          <Text className="mt-1 text-sm font-semibold text-[#0B1B3D]">
                            {selectedAddress.label}
                            <Text className="font-normal text-[#64748B]">
                              {" — "}
                              {selectedAddress.line1}, {selectedAddress.locality}
                            </Text>
                          </Text>
                        ) : (
                          <Text className="mt-1 text-sm text-[#64748B]">Choose where the work happens.</Text>
                        )}
                        {!isServiceable && selectedAddress ? (
                          <Text className="mt-1 text-xs font-semibold text-danger-text">
                            ⚠️ Service not available in this pincode ({selectedAddress.postal_code})
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setAddressSheetOpen(true)}
                      className="rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-1.5 active:bg-[#F2EFE9] hover:bg-[#F2EFE9]"
                    >
                      <Text className="text-xs font-bold text-[#0B1B3D]">{selectedAddress ? "Edit" : "Add address"}</Text>
                    </Pressable>
                  </View>

                  {/* Slot Row */}
                  <View className="border-t border-[#F1EFEB] flex-row items-center justify-between p-5">
                    <View className="flex-row items-center gap-3.5 min-w-0 flex-1 mr-4">
                      <ClockIcon />
                      <View className="min-w-0 flex-1">
                        <Text className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                          {groups.length > 1 ? "Slots" : "Slot"}
                        </Text>
                        {isScheduled ? (
                          <View className="mt-1 gap-0.5">
                            {groups.map((group) => {
                              const startsAt = starts[group.key];
                              return (
                                <Text key={group.key} className="text-sm font-bold text-[#0B1B3D]">
                                  {startsAt ? formatChosen(startsAt) : "No time chosen"}
                                </Text>
                              );
                            })}
                          </View>
                        ) : (
                          <Text className="mt-1 text-sm text-[#64748B]">No time chosen</Text>
                        )}
                      </View>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!effectiveAddressId || groups.length === 0 || groupsQuery.isError}
                      onPress={() => {
                        if (effectiveAddressId && groups.length > 0 && !groupsQuery.isError) {
                          setSlotsSheetOpen(true);
                        }
                      }}
                      className="rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-1.5 active:bg-[#F2EFE9] hover:bg-[#F2EFE9] disabled:opacity-40"
                    >
                      <Text className="text-xs font-bold text-[#0B1B3D]">
                        {!effectiveAddressId || groups.length === 0 || groupsQuery.isError
                          ? "Select slots"
                          : isScheduled
                          ? "Edit"
                          : "Select slots"}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Back to cart link */}
                  <View className="border-t border-[#F1EFEB] px-5 py-4">
                    <Pressable
                      accessibilityRole="link"
                      onPress={() => {
                        if (router.canGoBack()) {
                          router.back();
                        } else {
                          router.push("/cart" as never);
                        }
                      }}
                    >
                      <Text className="text-sm font-semibold text-[#0B1B3D] hover:underline">
                        Back to cart
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* Cancellation policy card matching Image 3 */}
                <View className="mt-6 flex-row items-start gap-3 rounded-2xl border border-[#FFEDD5] bg-[#FFF9F5] p-5">
                  <View className="mt-0.5 size-9 items-center justify-center rounded-full bg-[#FFE8D6]">
                    <OrangeShieldIcon />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm font-bold text-[#0B1B3D]">Cancellation policy</Text>
                    <Text className="mt-1 text-sm leading-relaxed text-[#64748B]">
                      Free cancellation before a professional is assigned. After that a fee may apply,
                      depending on how close the visit is.
                    </Text>
                  </View>
                </View>

                {/* Errors display if any */}
                {createPlanSet.isError || createQuote.isError || createCheckout.isError ? (
                  <View className="mt-4 rounded-xl border border-danger-line bg-critical-50 p-3.5">
                    <Text className="text-xs font-semibold text-danger-text">
                      {describeError(createPlanSet.error ?? createQuote.error ?? createCheckout.error, "mutation").message}
                    </Text>
                    <Pressable onPress={rescheduleFromScratch} className="mt-2">
                      <Text className="text-xs font-bold text-accent">Reset schedule & try again</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>

              {/* Right Column: Order Summary, Pricing note, Confirm booking & Secure booking */}
              <View className="w-[380px] shrink-0 gap-4">
                {/* Service Card */}
                {cart ? (
                  <View className="rounded-2xl border border-[#F1EFEB] bg-white p-5 shadow-xs">
                    <View className="flex-row items-center justify-between pb-3 border-b border-[#F4F2EE]">
                      <Text className="text-base font-bold text-[#0B1B3D]">
                        {groups[0]?.label || cart.items[0]?.service_name || "Home Cleaning"}
                      </Text>
                      <Text className="text-xs text-[#64748B]">
                        Approx. {Math.floor((groups[0]?.estimated_duration_minutes ?? 120) / 60)} hrs {((groups[0]?.estimated_duration_minutes ?? 120) % 60) > 0 ? `& ${(groups[0]?.estimated_duration_minutes ?? 120) % 60} mins` : ""}
                      </Text>
                    </View>

                    <View className="mt-3 gap-3">
                      {cart.items.map((item) => (
                        <View key={item.id} className="flex-row items-center gap-3">
                          <View className="size-14 rounded-xl bg-[#F4F1EC] items-center justify-center overflow-hidden shrink-0">
                            <CheckoutItemCover slug={item.service_slug} />
                          </View>
                          <View className="min-w-0 flex-1">
                            <Text className="text-sm font-bold text-[#0B1B3D]" numberOfLines={1}>{item.service_name}</Text>
                            {item.variant_name ? (
                              <Text className="mt-0.5 text-xs text-[#64748B]" numberOfLines={1}>{item.variant_name}</Text>
                            ) : null}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {/* Estimate Note Box */}
                <View className="rounded-2xl border border-[#D0E2FF] bg-[#EDF4FC] p-4 flex-row items-start gap-3">
                  <View className="mt-0.5 size-7 items-center justify-center rounded-full bg-[#DCEBFE]">
                    <Svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="#2563EB" strokeWidth={2}>
                      <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <Circle cx="12" cy="7" r="4" />
                    </Svg>
                  </View>
                  <Text className="text-xs leading-relaxed text-[#1E3A8A] flex-1">
                    We work out the price once every visit has a time — it depends on how many professionals your booking needs.
                  </Text>
                </View>

                {/* Confirm Booking Action Card */}
                <View className="rounded-2xl border border-[#F1EFEB] bg-white p-5 shadow-xs">
                  {quote !== null && quote.status === "ACTIVE" ? (
                    <Button
                      size="lg"
                      loading={isConfirming}
                      loadingLabel={isPricing ? "Working out your price" : "Confirming"}
                      onPress={handleConfirmBooking}
                      className="bg-[#EA580C] hover:bg-[#D9480F]"
                    >
                      Confirm booking
                    </Button>
                  ) : (
                    <Pressable
                      disabled={!isScheduled || isPricing || groupsQuery.isError}
                      onPress={handleConfirmBooking}
                      className="w-full items-center justify-center rounded-xl bg-[#E6E0D6] py-3.5"
                    >
                      <Text className="text-base font-semibold text-[#544D42]">
                        {isPricing ? "Working out your price…" : "Confirm booking"}
                      </Text>
                    </Pressable>
                  )}

                  <Text className="mt-3 text-center text-xs text-[#64748B]">
                    You will pay after we have assigned your professionals.
                  </Text>

                  {quote === null && !isPricing ? (
                    <Text className="mt-1 text-center text-xs text-[#64748B]">
                      Pick an address and a time for every visit to continue.
                    </Text>
                  ) : null}

                  {/* Secure booking badge */}
                  <View className="mt-4 flex-row items-start gap-2.5 pt-3 border-t border-[#F4F2EE]">
                    <View className="mt-0.5 size-8 items-center justify-center rounded-full bg-[#FFF4EB]">
                      <OrangeShieldIcon />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="text-xs font-bold text-[#0B1B3D]">Secure booking</Text>
                      <Text className="text-[11px] text-[#64748B]">Your data is safe with us.</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>

          <DesktopSiteFooter />
        </ScrollView>

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

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4 py-4 pb-20"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
        }
      >
        {/* Top: Circular Back Button matching Image 1 */}
        <View style={{ paddingTop: Math.max(insets.top, 24) + 6 }}>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/cart" as never);
              }
            }}
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
              !effectiveAddressId || groups.length === 0 || groupsQuery.isError
                ? undefined
                : isScheduled
                ? "Edit"
                : "Select slots"
            }
            actionVariant="outline"
            onAction={() => {
              if (effectiveAddressId && groups.length > 0 && !groupsQuery.isError) {
                setSlotsSheetOpen(true);
              }
            }}
          >
            {!effectiveAddressId ? (
              <Text className="text-sm text-text-secondary">Pick an address first — times depend on area.</Text>
            ) : isAddressKnownUnserviceable ? (
              <View className="rounded-lg bg-critical-50 p-2.5">
                <Text className="text-xs font-semibold text-danger-text">
                  Service not available in this pincode ({selectedAddress?.postal_code ?? ""})
                </Text>
                <Text className="mt-1 text-xs text-text-secondary leading-relaxed">
                  We do not currently have verified technicians covering this address. Please choose a different address.
                </Text>
                <Pressable onPress={() => setAddressSheetOpen(true)} className="mt-1.5">
                  <Text className="text-xs font-bold text-accent">Change address &rarr;</Text>
                </Pressable>
              </View>
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
                {cartMergeConflict(groupsQuery.error) !== null ? (
                  <View className="mt-1.5">
                    <Text className="text-xs text-text-secondary leading-relaxed">
                      You have overlapping items from a previous session. Please review your cart to continue.
                    </Text>
                    <Pressable onPress={() => router.replace("/cart" as never)} className="mt-1">
                      <Text className="text-xs font-bold text-accent">Review cart &rarr;</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Text className="mt-1 text-xs text-text-secondary leading-relaxed">
                      We do not currently have verified technicians covering this address ({selectedAddress?.postal_code ?? ""}) for all selected services. Please choose a different address.
                    </Text>
                    <Pressable onPress={() => setAddressSheetOpen(true)} className="mt-1.5">
                      <Text className="text-xs font-bold text-accent">Change address &rarr;</Text>
                    </Pressable>
                  </>
                )}
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
              disabled={!isScheduled || isPricing || groupsQuery.isError}
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
