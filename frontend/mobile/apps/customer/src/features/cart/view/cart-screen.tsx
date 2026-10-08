// Ported from frontend/apps/customer/features/cart/view/cart-workspace.tsx
import { describeError } from "@vsolve/query/native";
import { Button, EmptyState, ErrorState, Spinner, Text, formatMoney } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { useServiceDetail } from "@/features/catalog/client-queries";
import {
  useAddCartItem,
  useCart,
  useCartSuggestions,
  useRemoveCartItem,
  useUpdateCartItem,
  type Cart,
  type CartItem,
} from "@/features/checkout/queries";
import { CartSuggestions } from "./cart-suggestions";

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#00112e" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m15 18-6-6 6-6" />
    </Svg>
  );
}

function TrashIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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
  const imageUrl = detail.data?.cover?.url ?? "";

  return (
    <View className="rounded-2xl border border-line bg-surface p-4 shadow-2xs">
      <View className="flex-row items-start gap-3">
        {/* Thumbnail */}
        <View className="size-16 items-center justify-center overflow-hidden rounded-xl bg-[#F4F1EC]">
          {imageUrl !== "" ? (
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
            <View className="size-full items-center justify-center bg-surface-sunken">
              <Text className="text-xs font-bold text-text-muted">VS</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View className="min-w-0 flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-bold text-navy-900 leading-snug" numberOfLines={2}>
                {item.service_name}
              </Text>
              {item.variant_name ? (
                <Text className="mt-0.5 text-xs text-text-secondary" numberOfLines={1}>
                  {item.variant_name}
                </Text>
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.service_name}`}
              onPress={onRemove}
              disabled={isPending}
              className="p-1 rounded-lg active:bg-red-50"
            >
              <TrashIcon />
            </Pressable>
          </View>

          {/* Stepper and Price */}
          <View className="mt-3 flex-row items-center justify-between pt-2 border-t border-line/60">
            {/* Quantity Stepper */}
            <View className="flex-row items-center rounded-lg border border-line bg-surface-sunken px-2 py-0.5 gap-2.5">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decrease quantity"
                disabled={isPending || item.quantity <= 1}
                onPress={() => onUpdateQuantity(item.quantity - 1)}
                className="px-1 disabled:opacity-30"
              >
                <Text className="text-base font-bold text-navy-900">-</Text>
              </Pressable>
              <Text className="min-w-[16px] text-center text-xs font-bold text-navy-900 tabular-nums">
                {item.quantity}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Increase quantity"
                disabled={isPending}
                onPress={() => onUpdateQuantity(item.quantity + 1)}
                className="px-1 disabled:opacity-30"
              >
                <Text className="text-base font-bold text-navy-900">+</Text>
              </Pressable>
            </View>

            {item.amount ? (
              <Text className="text-sm font-extrabold text-navy-900 tabular-nums">
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
  const router = useRouter();
  const cartQuery = useCart();
  const addItem = useAddCartItem();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();

  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [addingVariantId, setAddingVariantId] = useState<string | null>(null);

  const cart = cartQuery.data;
  const suggestionsQuery = useCartSuggestions(cart?.version ?? null);
  const suggestions = suggestionsQuery.data ?? [];

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
    return (
      <View className="flex-1 bg-canvas">
        <View className="flex-row items-center border-b border-line bg-surface px-4 py-3">
          <Pressable onPress={() => router.back()} className="mr-3 p-1 rounded-full active:bg-surface-sunken">
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

  return (
    <View className="flex-1 bg-canvas">
      {/* Header */}
      <View className="flex-row items-center justify-between border-b border-line bg-surface px-4 py-3">
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="p-1 rounded-full active:bg-surface-sunken">
            <BackIcon />
          </Pressable>
          <Text className="text-lg font-bold text-navy-900">Your Cart</Text>
        </View>
        <Text className="text-xs font-semibold text-text-secondary">
          {cart.items.length} {cart.items.length === 1 ? "service" : "services"}
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4 pb-28" showsVerticalScrollIndicator={false}>
        {/* Items List */}
        <View className="gap-3">
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
          <View className="mt-2 rounded-2xl border border-line bg-surface p-4 shadow-2xs">
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

      {/* Floating Bottom Checkout Bar */}
      <View className="absolute bottom-0 left-0 right-0 border-t border-line bg-surface p-4 shadow-raised">
        <Button
          size="lg"
          block
          onPress={() => router.push("/checkout" as never)}
        >
          Proceed to Checkout
        </Button>
      </View>
    </View>
  );
}
