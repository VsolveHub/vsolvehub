// Ported from frontend/apps/customer/features/cart/view/cart-workspace.tsx
import { describeError } from "@vsolve/query/native";
import { useAuthStore } from "@vsolve/mobile-core";
import { Button, EmptyState, ErrorState, Spinner, Text, formatMoney } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { useAddresses } from "@/features/addresses/queries";
import { resolveImageUrl } from "@/features/catalog/category-artwork";
import { useServiceDetail } from "@/features/catalog/client-queries";
import {
  useAddCartItem,
  useCart,
  useCartSuggestions,
  useRemoveCartItem,
  useSchedulingGroups,
  useUpdateCartItem,
  type Cart,
  type CartItem,
} from "@/features/checkout/queries";
import { SlotsSheet } from "@/features/checkout/view/slots-sheet";
import { deriveSchedulingGroups } from "@/features/checkout/view/scheduling-groups";
import { useIsDesktop } from "@/lib/responsive";
import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";
import { CartSuggestions } from "./cart-suggestions";

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#0B1B3D" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m15 18-6-6 6-6" />
    </Svg>
  );
}

function TrashIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 6h18" />
      <Path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <Path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </Svg>
  );
}

function CartItemRow({
  item,
  cartVersion,
  onUpdateQuantity,
  onRemove,
  isPending,
}: {
  item: CartItem;
  cartVersion: number;
  onUpdateQuantity: (quantity: number) => void;
  onRemove: () => void;
  isPending: boolean;
}) {
  const detail = useServiceDetail(item.service_slug);
  const rawImageUrl = detail.data?.cover?.url;
  const imageUrl = resolveImageUrl(rawImageUrl);

  return (
    <View className="rounded-3xl border border-[#F1EFEB] bg-white p-5 shadow-xs mb-3">
      <View className="flex-row items-start">
        {/* Thumbnail */}
        <View className="size-16 items-center justify-center overflow-hidden rounded-2xl bg-[#F4F1EC] shrink-0">
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              contentFit={
                imageUrl.includes("/Service Cover/") || imageUrl.includes("/Service%20Cover/")
                  ? "contain"
                  : "cover"
              }
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <View className="size-full items-center justify-center bg-[#F4F1EC]">
              <Text className="text-xs font-bold text-[#94A3B8]">VS</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View className="ml-4 min-w-0 flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <View className="min-w-0 flex-1">
              <Text className="text-base font-bold text-[#0B1B3D] leading-snug" numberOfLines={2}>
                {item.service_name}
              </Text>
              {item.variant_name ? (
                <Text className="mt-0.5 text-xs text-[#64748B]" numberOfLines={1}>
                  {item.variant_name}
                </Text>
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.service_name}`}
              hitSlop={12}
              onPress={onRemove}
              disabled={isPending}
              className="p-1 rounded-lg active:bg-gray-100"
            >
              <TrashIcon />
            </Pressable>
          </View>

          {/* Stepper and Price matching Image 1 */}
          <View className="mt-5 flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Text className="mr-3 text-xs font-semibold text-[#64748B]">Quantity</Text>
              <View className="flex-row items-center rounded-xl border border-[#E5E7EB] bg-white overflow-hidden">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Decrease quantity"
                  disabled={isPending || item.quantity <= 1}
                  onPress={() => onUpdateQuantity(item.quantity - 1)}
                  className="px-3 py-1.5 active:bg-[#F2EFE9] disabled:opacity-30"
                >
                  <Text className="text-sm font-semibold text-[#0B1B3D]">-</Text>
                </Pressable>
                <Text className="min-w-[24px] text-center text-xs font-bold text-[#0B1B3D] tabular-nums">
                  {item.quantity}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Increase quantity"
                  disabled={isPending}
                  onPress={() => onUpdateQuantity(item.quantity + 1)}
                  className="px-3 py-1.5 active:bg-[#F2EFE9] disabled:opacity-30"
                >
                  <Text className="text-sm font-semibold text-[#0B1B3D]">+</Text>
                </Pressable>
              </View>
            </View>

            {item.amount ? (
              <Text className="text-lg font-extrabold text-[#0B1B3D] tabular-nums">
                {formatMoney(item.amount.amount_paise)}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function DesktopCartItemRow({
  item,
  cartVersion,
  onUpdateQuantity,
  onRemove,
  isPending,
}: {
  item: CartItem;
  cartVersion: number;
  onUpdateQuantity: (quantity: number) => void;
  onRemove: () => void;
  isPending: boolean;
}) {
  const detail = useServiceDetail(item.service_slug);
  const rawImageUrl = detail.data?.cover?.url;
  const imageUrl = resolveImageUrl(rawImageUrl);

  return (
    <View className="rounded-2xl border border-[#F1EFEB] bg-white p-6 shadow-xs">
      <View className="flex-row items-start">
        {/* Thumbnail */}
        <View className="size-20 items-center justify-center overflow-hidden rounded-xl bg-[#F4F1EC] shrink-0">
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              contentFit={
                imageUrl.includes("/Service Cover/") || imageUrl.includes("/Service%20Cover/")
                  ? "contain"
                  : "cover"
              }
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <View className="size-full items-center justify-center bg-[#F4F1EC]">
              <Text className="text-xs font-bold text-[#94A3B8]">VS</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View className="ml-5 min-w-0 flex-1">
          <View className="flex-row items-start justify-between gap-4">
            <View className="min-w-0 flex-1">
              <Text className="text-base font-bold text-[#0B1B3D] leading-snug">
                {item.service_name}
              </Text>
              {item.variant_name ? (
                <Text className="mt-1 text-xs text-[#64748B]">
                  {item.variant_name}
                </Text>
              ) : null}
              <Text className="mt-1 text-xs text-[#64748B]">
                quantity: {item.quantity}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.service_name}`}
              hitSlop={12}
              onPress={onRemove}
              disabled={isPending}
              className="p-1 rounded-lg hover:bg-red-50 active:bg-red-50"
            >
              <TrashIcon />
            </Pressable>
          </View>

          {/* Stepper and Price matching Image 1 */}
          <View className="mt-6 flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Text className="mr-3 text-xs font-semibold text-[#64748B]">Quantity</Text>
              <View className="flex-row items-center rounded-lg border border-[#E5E7EB] bg-white overflow-hidden">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Decrease quantity"
                  disabled={isPending || item.quantity <= 1}
                  onPress={() => onUpdateQuantity(item.quantity - 1)}
                  className="px-2.5 py-1.5 active:bg-[#F2EFE9] hover:bg-[#F2EFE9] disabled:opacity-30"
                >
                  <Text className="text-sm font-semibold text-[#0B1B3D]">-</Text>
                </Pressable>
                <Text className="min-w-[28px] text-center text-xs font-bold text-[#0B1B3D] tabular-nums">
                  {item.quantity}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Increase quantity"
                  disabled={isPending}
                  onPress={() => onUpdateQuantity(item.quantity + 1)}
                  className="px-2.5 py-1.5 active:bg-[#F2EFE9] hover:bg-[#F2EFE9] disabled:opacity-30"
                >
                  <Text className="text-sm font-semibold text-[#0B1B3D]">+</Text>
                </Pressable>
              </View>
            </View>

            {item.amount ? (
              <Text className="text-xl font-bold text-[#0B1B3D] tabular-nums">
                {formatMoney(item.amount.amount_paise)}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

export function CartScreen() {
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status } = useAuthStore();
  const cartQuery = useCart();
  const addressesQuery = useAddresses(status === "signedIn");
  const addItem = useAddCartItem();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();

  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [addingVariantId, setAddingVariantId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Slots Sheet state for Image 2, Image 3, and Image 4
  const [slotsSheetOpen, setSlotsSheetOpen] = useState(false);
  const [selectedStarts, setSelectedStarts] = useState<Record<string, string>>({});

  const cart = cartQuery.data;
  const addresses = addressesQuery.data ?? [];
  const defaultAddressId = addresses[0]?.id ?? "";

  const groupsQuery = useSchedulingGroups(
    cart && defaultAddressId
      ? { cartVersion: cart.version, addressId: defaultAddressId }
      : null
  );

  const schedulingGroups = useMemo(
    () => deriveSchedulingGroups(cart?.items ?? [], groupsQuery.data),
    [cart?.items, groupsQuery.data]
  );

  const suggestionsQuery = useCartSuggestions(cart?.version ?? null);
  const suggestions = suggestionsQuery.data ?? [];

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/catalog" as never);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([cartQuery.refetch(), suggestionsQuery.refetch()]);
    setRefreshing(false);
  };

  const handleOpenSlots = () => {
    setSlotsSheetOpen(true);
  };

  const handleConfirmSlots = (confirmedStarts: Record<string, string>) => {
    setSelectedStarts(confirmedStarts);
    setSlotsSheetOpen(false);
    router.push({
      pathname: "/checkout",
      params: { slots: JSON.stringify(confirmedStarts) },
    } as never);
  };

  if (cartQuery.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Spinner size="lg" />
      </View>
    );
  }

  if (cartQuery.isError) {
    return (
      <View className="flex-1 justify-center p-6 bg-canvas">
        <ErrorState
          title="Could not load your cart"
          message={describeError(cartQuery.error, "read").message}
          actionLabel="Try again"
          onAction={() => void cartQuery.refetch()}
        />
      </View>
    );
  }

  const isEmpty = !cart || cart.items.length === 0;

  if (isEmpty) {
    if (isDesktop) {
      return (
        <ScrollView className="flex-1 bg-[#FAF9F7]" contentContainerClassName="pb-0">
          <View className="mx-auto w-full max-w-[1216px] px-6 lg:px-8 pt-8 pb-16 min-h-[calc(100vh-180px)]">
            <Text className="text-[2.5rem] font-extrabold leading-[1.15] tracking-tight text-[#0B1B3D]">
              Your cart
            </Text>
            <View className="mt-8 rounded-2xl border border-[#F1EFEB] bg-white p-12 items-center justify-center shadow-xs">
              <EmptyState
                title="Nothing in your cart yet"
                description="Browse services and add what you need. You can book several services in one visit."
                action={
                  <Button onPress={() => router.push("/catalog" as never)} className="bg-[#EA580C]">
                    Browse services
                  </Button>
                }
              />
            </View>
          </View>
          <DesktopSiteFooter />
        </ScrollView>
      );
    }

    return (
      <View className="flex-1 bg-canvas">
        <View
          style={{ paddingTop: Math.max(insets.top, 24) + 8 }}
          className="flex-row items-center border-b border-line bg-surface px-4 pb-3"
        >
          <Pressable hitSlop={8} onPress={handleBack} className="mr-3 p-1 rounded-full active:bg-surface-sunken">
            <BackIcon />
          </Pressable>
          <Text className="text-lg font-bold text-navy-900">Your Cart</Text>
        </View>
        <View className="flex-1 items-center justify-center p-6">
          <EmptyState
            title="Nothing in your cart yet"
            description="Browse services and add what you need. You can book several services in one visit."
            action={
              <Button onPress={() => router.push("/catalog" as never)}>
                Browse services
              </Button>
            }
          />
        </View>
      </View>
    );
  }

  const estimate = cart.estimate;

  if (isDesktop) {
    return (
      <ScrollView
        className="flex-1 bg-[#FAF9F7]"
        contentContainerClassName="pb-0"
        showsVerticalScrollIndicator={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
        }
      >
        <View className="mx-auto w-full max-w-[1216px] px-6 lg:px-8 pt-8 pb-16 min-h-[calc(100vh-180px)]">
          {/* Header Title Section matching Image 1 */}
          <View>
            <Text className="text-[2.5rem] font-extrabold leading-[1.15] tracking-tight text-[#0B1B3D]">
              Your cart
            </Text>
            <Text className="mt-1 text-sm text-[#64748B]">
              {cart.items.length} {cart.items.length === 1 ? "service" : "services"} · saved version {cart.version}
            </Text>
          </View>

          {/* 2-Column Grid */}
          <View className="mt-8 flex-row items-start gap-8">
            {/* Left Column: Cart items */}
            <View className="min-w-0 flex-1 gap-4">
              {cart.items.map((item) => (
                <DesktopCartItemRow
                  key={item.id}
                  item={item}
                  cartVersion={cart.version}
                  isPending={pendingItemId === item.id || updateItem.isPending || removeItem.isPending}
                  onUpdateQuantity={(quantity) => {
                    setPendingItemId(item.id);
                    updateItem.mutate(
                      {
                        itemId: item.id,
                        expectedCartVersion: cart.version,
                        expectedItemVersion: item.version,
                        quantity,
                      },
                      { onSettled: () => setPendingItemId(null) },
                    );
                  }}
                  onRemove={() => {
                    setPendingItemId(item.id);
                    removeItem.mutate(
                      {
                        itemId: item.id,
                        expectedCartVersion: cart.version,
                        expectedItemVersion: item.version,
                      },
                      { onSettled: () => setPendingItemId(null) },
                    );
                  }}
                />
              ))}

              {/* Suggestions */}
              {suggestions.length > 0 ? (
                <View className="mt-4">
                  <CartSuggestions
                    suggestions={suggestions}
                    isAdding={addItem.isPending}
                    addingVariantId={addingVariantId}
                    onAdd={(variantId) => {
                      setAddingVariantId(variantId);
                      addItem.mutate(
                        { expectedCartVersion: cart.version, variantId, quantity: 1 },
                        { onSettled: () => setAddingVariantId(null) },
                      );
                    }}
                  />
                </View>
              ) : null}
            </View>

            {/* Right Column: Payment summary card */}
            <View className="w-[380px] shrink-0">
              <View className="rounded-2xl border border-[#F1EFEB] bg-white p-6 shadow-xs">
                <Text className="text-lg font-bold text-[#0B1B3D]">Payment summary</Text>

                <View className="mt-5 gap-3.5">
                  {cart.items.map((item) => (
                    <View key={item.id} className="flex-row items-center justify-between">
                      <Text className="text-sm text-[#0B1B3D] flex-1 mr-2" numberOfLines={1}>{item.service_name}</Text>
                      <Text className="text-sm font-bold text-[#0B1B3D] tabular-nums">
                        {item.amount ? formatMoney(item.amount.amount_paise) : "—"}
                      </Text>
                    </View>
                  ))}

                  {estimate ? (
                    <>
                      <View className="flex-row items-center justify-between pt-1">
                        <Text className="text-sm font-semibold text-[#0B1B3D]">Subtotal</Text>
                        <Text className="text-sm font-bold text-[#0B1B3D] tabular-nums">
                          {formatMoney(estimate.subtotal.amount_paise)}
                        </Text>
                      </View>

                      {estimate.minimum_visit_topup.amount_paise > 0 ? (
                        <View className="flex-row items-center justify-between">
                          <Text className="text-sm text-[#64748B]">Minimum visit charge</Text>
                          <Text className="text-sm font-bold text-[#0B1B3D] tabular-nums">
                            {formatMoney(estimate.minimum_visit_topup.amount_paise)}
                          </Text>
                        </View>
                      ) : null}

                      <View className="flex-row items-center justify-between">
                        <Text className="text-sm text-[#64748B]">Platform fee</Text>
                        <Text className="text-sm font-bold text-[#0B1B3D] tabular-nums">
                          {formatMoney(estimate.platform_fee.amount_paise)}
                        </Text>
                      </View>

                      <View className="border-t border-[#F1EFEB] pt-4 mt-1">
                        <View className="flex-row items-baseline justify-between">
                          <Text className="text-base font-bold text-[#0B1B3D]">Amount to pay</Text>
                          <Text className="text-2xl font-extrabold text-[#0B1B3D] tabular-nums">
                            {formatMoney(estimate.total.amount_paise)}
                          </Text>
                        </View>
                        <View className="flex-row items-center justify-between mt-1">
                          <Text className="text-xs text-[#64748B]">Includes GST</Text>
                          <Text className="text-xs font-semibold text-[#64748B] tabular-nums">
                            {formatMoney(estimate.tax.amount_paise)}
                          </Text>
                        </View>
                      </View>
                    </>
                  ) : null}
                </View>

                {/* Desktop Proceed to Checkout Button */}
                <Pressable
                  accessibilityRole="button"
                  onPress={handleOpenSlots}
                  className="mt-6 w-full items-center justify-center rounded-xl bg-[#EA580C] hover:bg-[#D9480F] active:bg-[#C2410C] py-3.5 shadow-xs"
                >
                  <Text className="text-base font-bold text-white">Proceed to checkout</Text>
                </Pressable>

                <Text className="mt-3 text-center text-xs leading-relaxed text-[#64748B]">
                  You pick a time and address next. Nothing is charged until you confirm.
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Slots Modal */}
        <SlotsSheet
          open={slotsSheetOpen}
          onOpenChange={setSlotsSheetOpen}
          groups={schedulingGroups}
          cartVersion={cart?.version ?? 0}
          addressId={defaultAddressId}
          initialStarts={selectedStarts}
          onConfirm={handleConfirmSlots}
        />

        <DesktopSiteFooter />
      </ScrollView>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      {/* Header matching Image 1 */}
      <View
        style={{ paddingTop: Math.max(insets.top, 24) + 8 }}
        className="px-5 pb-3 bg-canvas"
      >
        <Pressable
          hitSlop={8}
          onPress={handleBack}
          className="size-10 rounded-full bg-white border border-[#E5E7EB] items-center justify-center shadow-xs mb-3 active:bg-surface-sunken"
        >
          <BackIcon />
        </Pressable>
        <Text className="text-2xl font-extrabold text-[#0B1B3D]">Your cart</Text>
        <Text className="mt-0.5 text-sm text-[#64748B]">
          {cart.items.length} {cart.items.length === 1 ? "service" : "services"} in your cart
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-5 pb-32"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
        }
      >
        {/* Items List */}
        <View className="gap-2">
          {cart.items.map((item) => (
            <CartItemRow
              key={item.id}
              item={item}
              cartVersion={cart.version}
              isPending={pendingItemId === item.id || updateItem.isPending || removeItem.isPending}
              onUpdateQuantity={(quantity) => {
                setPendingItemId(item.id);
                updateItem.mutate(
                  {
                    itemId: item.id,
                    expectedCartVersion: cart.version,
                    expectedItemVersion: item.version,
                    quantity,
                  },
                  { onSettled: () => setPendingItemId(null) },
                );
              }}
              onRemove={() => {
                setPendingItemId(item.id);
                removeItem.mutate(
                  {
                    itemId: item.id,
                    expectedCartVersion: cart.version,
                    expectedItemVersion: item.version,
                  },
                  { onSettled: () => setPendingItemId(null) },
                );
              }}
            />
          ))}
        </View>

        {/* Suggestions */}
        <CartSuggestions
          suggestions={suggestions}
          isAdding={addItem.isPending}
          addingVariantId={addingVariantId}
          onAdd={(variantId) => {
            setAddingVariantId(variantId);
            addItem.mutate(
              { expectedCartVersion: cart.version, variantId, quantity: 1 },
              { onSettled: () => setAddingVariantId(null) },
            );
          }}
        />

        {/* Payment Summary Card */}
        {estimate ? (
          <View className="mt-2 rounded-2xl border border-line bg-surface p-5 shadow-2xs">
            <Text className="text-base font-bold text-navy-900 mb-3">Payment summary</Text>
            <View className="gap-2.5">
              <View className="flex-row justify-between">
                <Text className="text-sm text-text-secondary">Subtotal</Text>
                <Text className="text-sm font-semibold text-navy-900">
                  {formatMoney(estimate.subtotal.amount_paise)}
                </Text>
              </View>

              {estimate.minimum_visit_topup.amount_paise > 0 ? (
                <View className="flex-row justify-between">
                  <View>
                    <Text className="text-sm text-text-secondary">Minimum visit charge</Text>
                    <Text className="text-[11px] text-text-muted">Applied for minimum visit requirement</Text>
                  </View>
                  <Text className="text-sm font-semibold text-navy-900">
                    {formatMoney(estimate.minimum_visit_topup.amount_paise)}
                  </Text>
                </View>
              ) : null}

              <View className="flex-row justify-between">
                <Text className="text-sm text-text-secondary">Platform fee</Text>
                <Text className="text-sm font-semibold text-navy-900">
                  {formatMoney(estimate.platform_fee.amount_paise)}
                </Text>
              </View>

              <View className="flex-row justify-between pt-2.5 border-t border-line/70">
                <View>
                  <Text className="text-base font-bold text-navy-900">Estimated Total</Text>
                  <Text className="text-[11px] text-text-muted">Includes GST ({formatMoney(estimate.tax.amount_paise)})</Text>
                </View>
                <Text className="text-lg font-extrabold text-[#EA580C]">
                  {formatMoney(estimate.total.amount_paise)}
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Floating Bottom Checkout Bar matching Image 1 */}
      <View
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        className="absolute bottom-0 left-0 right-0 border-t border-[#F1EFEB] bg-white px-5 pt-3.5 shadow-raised"
      >
        <View className="flex-row items-center justify-between gap-4">
          <View className="min-w-0">
            <Text className="text-xs font-medium text-[#64748B]">Amount to pay</Text>
            <Text className="text-2xl font-extrabold text-[#0B1B3D] tabular-nums">
              {formatMoney(estimate?.total?.amount_paise ?? 0)}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={handleOpenSlots}
            className="rounded-xl bg-[#EA580C] px-6 py-3.5 active:bg-[#C2410C] shadow-xs"
          >
            <Text className="text-base font-bold text-white">Proceed to checkout</Text>
          </Pressable>
        </View>
      </View>

      {/* Slots Sheet matching Image 2, Image 3, and Image 4 */}
      <SlotsSheet
        open={slotsSheetOpen}
        onOpenChange={setSlotsSheetOpen}
        groups={schedulingGroups}
        cartVersion={cart?.version ?? 0}
        addressId={defaultAddressId}
        initialStarts={selectedStarts}
        onConfirm={handleConfirmSlots}
      />
    </View>
  );
}