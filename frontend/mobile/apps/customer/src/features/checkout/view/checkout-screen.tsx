// Ported from frontend/apps/customer/features/checkout/view/checkout-workspace.tsx
// Exact match with Image 1 (previous customer portal) and web specification
import { describeError } from "@vsolve/query/native";
import { useAuthStore } from "@vsolve/mobile-core";
import { Button, COLOR_TOKENS, Spinner, Text, cn, formatMoney } from "@vsolve/mobile-ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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
  useCandidateStarts,
  useSchedulingGroups,
} from "@/features/checkout/queries";
import { BookingModeToggle, type BookingMode } from "./booking-mode-toggle";
import { CustomerLoginSheet } from "@/features/session/customer-login-sheet";

import { Image } from "expo-image";
import { resolveImageUrl } from "@/features/catalog/category-artwork";
import { useServiceDetail } from "@/features/catalog/client-queries";
import { AddressSheet } from "./address-sheet";
import { ChevronLeftIcon, ClockIcon, DetailRow, PhoneIcon, PinIcon } from "./detail-row";
import { OrderSummary } from "./order-summary";
import { SlotsSheet } from "./slots-sheet";
import { deriveSchedulingGroups } from "./scheduling-groups";
import { useIsDesktop } from "@/lib/responsive";
import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";

function CheckoutItemCover({ slug }: { slug: string }) {
  const detail = useServiceDetail(slug);
  const imageUrl = resolveImageUrl(detail.data?.cover?.url);

  if (!imageUrl) {
    return (
      <View className="size-full items-center justify-center bg-surface-sunken">
        <Text className="text-xs font-bold text-text-muted">VS</Text>
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
    <Svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke={COLOR_TOKENS.action} strokeWidth={1.5}>
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
  const params = useLocalSearchParams<{ slots?: string }>();
  const status = useAuthStore((state) => state.status);
  const [loginOpen, setLoginOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const profileQuery = useCustomerProfile(status === "signedIn");
  const cartQuery = useCart(status === "signedIn");
  const addressesQuery = useAddresses(status === "signedIn");

  const [addressId, setAddressId] = useState<string | null>(null);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [slotsSheetOpen, setSlotsSheetOpen] = useState(false);
  const [starts, setStarts] = useState<Record<string, string>>(() => {
    if (params.slots) {
      try {
        const parsed = JSON.parse(params.slots);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {}
    }
    return {};
  });
  const [bookingMode, setBookingMode] = useState<BookingMode>("SCHEDULED");

  useEffect(() => {
    if (params.slots) {
      try {
        const parsed = JSON.parse(params.slots);
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
          setStarts(parsed);
        }
      } catch {}
    }
  }, [params.slots]);

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
  const derivedGroups = useMemo(
    () => deriveSchedulingGroups(cart?.items ?? [], groupsQuery.data),
    [cart?.items, groupsQuery.data],
  );
  const groups = groupsQuery.data && groupsQuery.data.length > 0 ? groupsQuery.data : derivedGroups;

  const firstGroupKey = groupsQuery.data && groupsQuery.data.length > 0 ? groupsQuery.data[0].key : null;
  const windowsQuery = useCandidateStarts(
    hasItems && effectiveAddressId && !isAddressKnownUnserviceable && firstGroupKey !== null
      ? {
        cartVersion: cart!.version,
        addressId: effectiveAddressId,
        groupKey: firstGroupKey,
      }
      : null,
  );
  const instant = windowsQuery.data?.instant;

  useEffect(() => {
    if (bookingMode === "INSTANT" && windowsQuery.data && !instant?.isAvailable) {
      setBookingMode("SCHEDULED");
    }
  }, [bookingMode, windowsQuery.data, instant?.isAvailable]);

  const createPlanSet = useCreatePlanSet();
  const createQuote = useCreatePlanQuote();
  const createCheckout = useCreateCheckout();

  const planSetQuery = usePlanSet(planSetId);
  const planSet = planSetQuery.data ?? null;
  const quoteQuery = usePlanQuote(quoteId);
  const quote = quoteQuery.data ?? null;

  const isScheduled =
    bookingMode === "INSTANT"
      ? Boolean(instant?.isAvailable && Object.keys(starts).length > 0)
      : groups.length > 0 && groups.every((g) => starts[g.key] && starts[g.key].trim().length > 0);
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

  function handleBookingModeChange(nextMode: BookingMode) {
    if (nextMode === bookingMode) return;
    setBookingMode(nextMode);
    setPlanSetId(null);
    setQuoteId(null);
    setStarts({});
    createPlanSet.reset();
    createQuote.reset();
    createCheckout.reset();

    if (nextMode === "INSTANT") {
      if (instant?.isAvailable && instant.earliestStartsAt && cart && effectiveAddressId) {
        const earliest = instant.earliestStartsAt;
        const startsObj: Record<string, string> = {};
        groups.forEach((g) => {
          startsObj[g.key] = earliest;
        });
        setStarts(startsObj);

        createPlanSet.mutate(
          {
            cartVersion: cart.version,
            addressId: effectiveAddressId,
            bookingMode: "INSTANT",
            preferredStarts: groups.map((g) => ({
              groupKey: g.key,
              startsAt: earliest,
            })),
          },
          {
            onSuccess: (result) => {
              if (!result) return;
              setPlanSetId(result.id);
              const recommended =
                result.plans.find((p) => p.is_recommended) ?? result.plans[0];
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
    }
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
        bookingMode: "SCHEDULED",
        preferredStarts,
      },
      {
        onSuccess: (result) => {
          if (!result) return;
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
      startsAt: starts[g.key] ?? (instant?.earliestStartsAt || ""),
    }));

    createPlanSet.mutate(
      {
        cartVersion: cart.version,
        addressId: effectiveAddressId,
        bookingMode,
        preferredStarts,
      },
      {
        onSuccess: (result) => {
          if (!result) return;
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
        <ScrollView className="flex-1 bg-canvas" contentContainerClassName="pb-0">
          <View className="mx-auto w-full max-w-[1216px] px-6 lg:px-8 pt-8 pb-16 min-h-[calc(100vh-180px)]">
            <Text className="text-[2.5rem] font-extrabold leading-[1.15] tracking-tight text-navy-950">
              Checkout
            </Text>
            <View className="mt-8 rounded-2xl border border-line bg-white p-12 items-center justify-center shadow-xs">
              <Text className="text-xl font-bold text-navy-950">Your cart is empty</Text>
              <Text className="mt-2 text-sm leading-relaxed text-text-secondary">
                There is nothing to check out. Nothing has been booked or charged.
              </Text>
              <View className="mt-6">
                <Button size="lg" variant="primary" onPress={() => router.replace("/catalog" as never)}>
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
  const phoneNumber = profileQuery.data?.phone_number ?? null;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([profileQuery.refetch(), cartQuery.refetch(), addressesQuery.refetch()]);
    setRefreshing(false);
  };

  if (isDesktop) {
    return (
      <View className="flex-1 bg-canvas">
        <ScrollView
          className="flex-1 bg-canvas"
          contentContainerClassName="pb-0"
          showsVerticalScrollIndicator={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLOR_TOKENS.action]} tintColor={COLOR_TOKENS.action} />
          }
        >
          <View className="mx-auto w-full max-w-[1216px] px-6 lg:px-8 pt-8 pb-16 min-h-[calc(100vh-180px)]">
            {/* Title matching Image 3 */}
            <Text className="text-[2.5rem] font-extrabold leading-[1.15] tracking-tight text-navy-950">
              Checkout
            </Text>

            {/* 2-Column Desktop Grid */}
            <View className="mt-8 flex-row items-start gap-8">
              {/* Left Column: Details Card + Cancellation policy */}
              <View className="min-w-0 flex-1">
                {/* Details Card */}
                <View className="overflow-hidden rounded-2xl border border-line bg-white shadow-xs">
                  {/* Phone Row */}
                  {phoneNumber ? (
                    <View className="flex-row items-center justify-between p-5">
                      <View className="flex-row items-center gap-3.5 min-w-0 flex-1">
                        <PhoneIcon />
                        <View className="min-w-0 flex-1">
                          <Text className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                            Send booking details to
                          </Text>
                          <Text className="mt-1 text-sm font-bold text-navy-950">{phoneNumber}</Text>
                        </View>
                      </View>
                    </View>
                  ) : null}

                  {/* Address Row */}
                  <View className={cn("flex-row items-center justify-between p-5", phoneNumber ? "border-t border-line" : "")}>
                    <View className="flex-row items-center gap-3.5 min-w-0 flex-1 mr-4">
                      <PinIcon />
                      <View className="min-w-0 flex-1">
                        <Text className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Address</Text>
                        {selectedAddress ? (
                          <Text className="mt-1 text-sm font-semibold text-navy-950">
                            {selectedAddress.label}
                            <Text className="font-normal text-text-secondary">
                              {" — "}
                              {selectedAddress.line1}, {selectedAddress.locality}
                            </Text>
                          </Text>
                        ) : (
                          <Text className="mt-1 text-sm text-text-secondary">Choose where the work happens.</Text>
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
                      className="rounded-lg border border-line bg-white px-3.5 py-1.5 active:bg-surface-sunken hover:bg-surface-sunken"
                    >
                      <Text className="text-xs font-bold text-navy-950">{selectedAddress ? "Edit" : "Add address"}</Text>
                    </Pressable>
                  </View>

                  {/* Booking Mode Row */}
                  <View className="border-t border-line p-5 bg-canvas/50">
                    <View className="mb-2">
                      <Text className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                        Booking Mode
                      </Text>
                    </View>
                    <BookingModeToggle
                      value={bookingMode}
                      onChange={handleBookingModeChange}
                      instant={instant}
                      disabled={effectiveAddressId === null || groups.length === 0}
                    />
                  </View>

                  {/* Arrival Time or Slot Row */}
                  {bookingMode === "INSTANT" ? (
                    <View className="border-t border-line flex-row items-center justify-between p-5">
                      <View className="flex-row items-center gap-3.5 min-w-0 flex-1 mr-4">
                        <ClockIcon />
                        <View className="min-w-0 flex-1">
                          <Text className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                            Arrival time
                          </Text>
                          <View className="mt-1 flex-row items-center gap-2">
                            <Text className="text-sm font-bold text-navy-950">
                              {instant?.etaMinutes ? `~${instant.etaMinutes} mins` : "30–45 mins"}
                            </Text>
                            <View className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5">
                              <Text className="text-[11px] font-semibold text-emerald-700">Instant</Text>
                            </View>
                          </View>
                          {instant?.earliestStartsAt ? (
                            <Text className="mt-0.5 text-xs text-text-secondary">
                              Starting around {formatChosen(instant.earliestStartsAt)}
                            </Text>
                          ) : null}
                          <Text className="mt-1 text-xs text-text-secondary">
                            Professional assigned immediately. Arrives in ~{instant?.etaMinutes ?? 35} mins.
                          </Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View className="border-t border-line flex-row items-start justify-between p-5">
                      <View className="flex-row items-start gap-3.5 min-w-0 flex-1 mr-4">
                        <View className="mt-0.5">
                          <ClockIcon />
                        </View>
                        <View className="min-w-0 flex-1">
                          <Text className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                            {groups.length > 1 ? "Slots" : "Slot"}
                          </Text>
                          <View className="mt-3 gap-4">
                            {groups.map((group) => {
                              const startsAt = starts[group.key];
                              return (
                                <Text key={group.key} className="text-sm leading-snug">
                                  {groups.length > 1 ? (
                                    <Text className="font-semibold text-[#0B1B3D]">
                                      {group.label}:{" "}
                                    </Text>
                                  ) : null}
                                  <Text
                                    className={
                                      startsAt
                                        ? "font-medium text-[#0B1B3D]"
                                        : "text-[#4A453E]"
                                    }
                                  >
                                    {startsAt ? formatChosen(startsAt) : "No time chosen"}
                                  </Text>
                                </Text>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        disabled={!effectiveAddressId || groups.length === 0}
                        onPress={() => {
                          if (effectiveAddressId && groups.length > 0) {
                            setSlotsSheetOpen(true);
                          }
                        }}
                        className="rounded-xl border border-[#D1D5DB] bg-white px-4 py-2 active:bg-surface-sunken hover:bg-surface-sunken disabled:opacity-40"
                      >
                        <Text className="text-xs font-bold text-[#0B1B3D]">
                          {!effectiveAddressId || groups.length === 0
                            ? "Select slot"
                            : isScheduled
                              ? "Edit"
                              : "Select slot"}
                        </Text>
                      </Pressable>
                    </View>
                  )}

                  {/* Back to cart link */}
                  <View className="border-t border-line px-5 py-4">
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
                      <Text className="text-sm font-semibold text-navy-950 hover:underline">
                        Back to cart
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* Cancellation policy card matching Image 3 */}
                <View className="mt-6 flex-row items-start gap-3 rounded-2xl border border-warning-line bg-warning-surface p-5">
                  <View className="mt-0.5 size-9 items-center justify-center rounded-full bg-amber-100">
                    <OrangeShieldIcon />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm font-bold text-navy-950">Cancellation policy</Text>
                    <Text className="mt-1 text-sm leading-relaxed text-text-secondary">
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
                  <View className="rounded-2xl border border-line bg-white p-5 shadow-xs">
                    <View className="flex-row items-center justify-between pb-3 border-b border-line">
                      <Text className="text-base font-bold text-navy-950">
                        {groups[0]?.label || cart.items[0]?.service_name || "Your booking"}
                      </Text>
                      <Text className="text-xs text-text-secondary">
                        Approx. {Math.floor((groups[0]?.estimated_duration_minutes ?? 120) / 60)} hrs {((groups[0]?.estimated_duration_minutes ?? 120) % 60) > 0 ? `& ${(groups[0]?.estimated_duration_minutes ?? 120) % 60} mins` : ""}
                      </Text>
                    </View>

                    <View className="mt-3 gap-3">
                      {cart.items.map((item) => (
                        <View key={item.id} className="flex-row items-center gap-3">
                          <View className="size-14 rounded-xl bg-surface-sunken items-center justify-center overflow-hidden shrink-0">
                            <CheckoutItemCover slug={item.service_slug} />
                          </View>
                          <View className="min-w-0 flex-1">
                            <Text className="text-sm font-bold text-navy-950" numberOfLines={1}>{item.service_name}</Text>
                            {item.variant_name ? (
                              <Text className="mt-0.5 text-xs text-text-secondary" numberOfLines={1}>{item.variant_name}</Text>
                            ) : null}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {/* Estimate Note Box */}
                <View className="rounded-2xl border border-info-line bg-info-surface p-4 flex-row items-start gap-3">
                  <View className="mt-0.5 size-7 items-center justify-center rounded-full bg-info-surface">
                    <Svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke={COLOR_TOKENS.info} strokeWidth={2}>
                      <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <Circle cx="12" cy="7" r="4" />
                    </Svg>
                  </View>
                  <Text className="text-xs leading-relaxed text-info-text flex-1">
                    We work out the price once every visit has a time — it depends on how many professionals your booking needs.
                  </Text>
                </View>

                {/* Confirm Booking Action Card */}
                <View className="rounded-2xl border border-line bg-white p-5 shadow-xs">
                  {quote !== null && quote.status === "ACTIVE" ? (
                    <Button
                      size="lg"
                      variant="primary"
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
                      className="w-full items-center justify-center rounded-xl bg-surface-sunken py-3.5"
                    >
                      <Text className="text-base font-semibold text-text-secondary">
                        {isPricing ? "Working out your price…" : "Confirm booking"}
                      </Text>
                    </Pressable>
                  )}

                  <Text className="mt-3 text-center text-xs text-text-secondary">
                    You will pay after we have assigned your professionals.
                  </Text>

                  {quote === null && !isPricing ? (
                    <Text className="mt-1 text-center text-xs text-text-secondary">
                      Pick an address and a time for every visit to continue.
                    </Text>
                  ) : null}

                  {/* Secure booking badge */}
                  <View className="mt-4 flex-row items-start gap-2.5 pt-3 border-t border-line">
                    <View className="mt-0.5 size-8 items-center justify-center rounded-full bg-amber-50">
                      <OrangeShieldIcon />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="text-xs font-bold text-navy-950">Secure booking</Text>
                      <Text className="text-[11px] text-text-secondary">Your data is safe with us.</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>

          <DesktopSiteFooter />
        </ScrollView>

        {/* Slots Sheet */}
        {cart ? (
          <SlotsSheet
            open={slotsSheetOpen}
            onOpenChange={setSlotsSheetOpen}
            groups={groups.length > 0 ? groups : deriveSchedulingGroups(cart.items)}
            cartVersion={cart.version}
            addressId={effectiveAddressId ?? ""}
            initialStarts={starts}
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLOR_TOKENS.action]} tintColor={COLOR_TOKENS.action} />
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
          {phoneNumber ? (
            <DetailRow
              icon={<PhoneIcon />}
              label="Send booking details to"
              isFirst
            >
              <Text className="text-sm font-normal text-text-secondary">{phoneNumber}</Text>
            </DetailRow>
          ) : null}

          {/* Address */}
          <DetailRow
            icon={<PinIcon />}
            label="Address"
            isFirst={!phoneNumber}
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

          {/* Booking Mode */}
          <View className="border-t border-line px-4 py-3 bg-surface-muted/30">
            <View className="mb-2">
              <Text className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Booking Mode
              </Text>
            </View>
            <BookingModeToggle
              value={bookingMode}
              onChange={handleBookingModeChange}
              instant={instant}
              disabled={effectiveAddressId === null || groups.length === 0}
            />
          </View>

          {/* Slot or Arrival time */}
          {bookingMode === "INSTANT" ? (
            <DetailRow icon={<ClockIcon />} label="Arrival time">
              <View className="gap-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm font-semibold text-text">
                    {instant?.etaMinutes ? `~${instant.etaMinutes} mins` : "30–45 mins"}
                  </Text>
                  <View className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5">
                    <Text className="text-[11px] font-medium text-emerald-700">Instant</Text>
                  </View>
                </View>
                {instant?.earliestStartsAt ? (
                  <Text className="text-xs text-text-secondary">
                    Starting around {formatChosen(instant.earliestStartsAt)}
                  </Text>
                ) : null}
                <Text className="mt-0.5 text-xs text-text-secondary">
                  Professional assigned immediately. Arrives in ~{instant?.etaMinutes ?? 35} mins.
                </Text>
              </View>
            </DetailRow>
          ) : (
            <DetailRow
              icon={<ClockIcon />}
              label={groups.length > 1 ? "Slots" : "Slot"}
              actionLabel={
                !effectiveAddressId || groups.length === 0 || groupsQuery.isError
                  ? undefined
                  : isScheduled
                    ? "Edit"
                    : "Select slot"
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
              ) : groupsQuery.isPending && groups.length === 0 ? (
                <View className="flex-row items-center gap-2 py-1">
                  <Spinner size="sm" />
                  <Text className="text-xs text-text-secondary">Finding available slots...</Text>
                </View>
              ) : groupsQuery.isError && groups.length === 0 ? (
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
              ) : (
                <View className="gap-4 mt-3">
                  {groups.map((group) => {
                    const startsAt = starts[group.key];
                    return (
                      <Text key={group.key} className="text-sm leading-snug">
                        {groups.length > 1 ? (
                          <Text className="font-semibold text-[#0B1B3D]">
                            {group.label}:{" "}
                          </Text>
                        ) : null}
                        <Text
                          className={
                            startsAt
                              ? "font-medium text-[#0B1B3D]"
                              : "text-[#4A453E]"
                          }
                        >
                          {startsAt ? formatChosen(startsAt) : "No time chosen"}
                        </Text>
                      </Text>
                    );
                  })}
                </View>
              )}
            </DetailRow>
          )}
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
              className="w-full items-center justify-center rounded-xl bg-surface-sunken py-3.5"
            >
              <Text className="text-base font-semibold text-text-secondary">
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
            <View className="mt-0.5 size-9 items-center justify-center rounded-full bg-amber-50">
              <OrangeShieldIcon />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-bold text-text">Secure booking</Text>
              <Text className="text-xs text-text-secondary">Your data is safe with us.</Text>
            </View>
          </View>
        </View>

        {/* Card 3: Cancellation policy matching Image 1 */}
        <View className="flex-row items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4.5">
          <View className="mt-0.5 size-9 items-center justify-center rounded-full bg-amber-100">
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
      {cart ? (
        <SlotsSheet
          open={slotsSheetOpen}
          onOpenChange={setSlotsSheetOpen}
          groups={groups.length > 0 ? groups : deriveSchedulingGroups(cart.items)}
          cartVersion={cart.version}
          addressId={effectiveAddressId ?? ""}
          initialStarts={starts}
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
