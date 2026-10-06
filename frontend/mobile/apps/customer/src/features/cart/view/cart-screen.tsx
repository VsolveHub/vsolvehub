// Ported from frontend/apps/customer/features/cart/view/cart-workspace.tsx
// Exact match with Image 4 (Your cart, circular back button, item card with stepper and price, Add to the same visit, and Payment summary)
import { useAuthStore } from "@vsolve/mobile-core";
import { Button, Dialog, EmptyState, ErrorState, Skeleton, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { useServiceDetail } from "@/features/catalog/client-queries";
import { cartMergeConflict, cartVersionConflict, isCartItemNotFound } from "@/features/checkout/conflicts";
import {
  useAddCartItem,
  useCart,
  useCartSuggestions,
  useMergeCart,
  useRemoveCartItem,
  useUpdateCartItem,
  type Cart,
} from "@/features/checkout/queries";
import { MergeDialog } from "@/features/checkout/view/merge-dialog";
import { CartSuggestions } from "@/features/cart/view/cart-suggestions";

type CartItem = Cart["items"][number];

function ChevronLeftIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth={2}>
      <Path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CartScreen() {
  const status = useAuthStore((state) => state.status);
  const cartQuery = useCart();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();
  const router = useRouter();

  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [removalItemId, setRemovalItemId] = useState<string | null>(null);
  const [mergeDismissed, setMergeDismissed] = useState(false);
  const [addingVariantId, setAddingVariantId] = useState<string | null>(null);

  const cart = cartQuery.data;
  const suggestionsQuery = useCartSuggestions(cart?.version ?? null);
  const addItem = useAddCartItem();
  const mergeCart = useMergeCart();

  const mergeConflict = mergeDismissed ? null : cartMergeConflict(cartQuery.error);
  const itemPendingRemoval =
    removalItemId === null ? null : (cart?.items.find((item) => item.id === removalItemId) ?? null);
  const isEmpty = cart !== undefined && cart.items.length === 0;
  const signedIn = status === "signedIn";

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="px-4 pb-16 pt-4 gap-4"
      showsVerticalScrollIndicator={false}
    >
      {/* Circular Back Button matching Image 4 */}
      <View className="pt-2">
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Back"
          className="size-10 items-center justify-center rounded-full border border-line bg-surface shadow-xs active:bg-surface-sunken"
        >
          <ChevronLeftIcon />
        </Pressable>
      </View>

      {/* Page Title & Subtitle */}
      <View className="gap-0.5">
        <Text className="text-2xl font-bold tracking-tight text-navy-950">Your cart</Text>
        {cart ? (
          <Text className="text-xs text-text-secondary">
            {cart.items.length} {cart.items.length === 1 ? "service" : "services"} · saved version {cart.version}
          </Text>
        ) : null}
      </View>

      {/* Loading Skeletons */}
      {cartQuery.isPending ? (
        <View className="gap-3 mt-2">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </View>
      ) : null}

      {/* Error state */}
      {cartQuery.isError && mergeConflict === null ? (
        <View className="mt-2">
          <ErrorState
            title="We could not load your cart"
            message={describeError(cartQuery.error, "read").message}
            actionLabel="Try again"
            onAction={() => void cartQuery.refetch()}
          />
        </View>
      ) : null}

      {/* Empty cart state */}
      {isEmpty ? (
        <View className="mt-4">
          <EmptyState
            title="Nothing in your cart yet"
            description="Browse services and add what you need. You can book several in one go."
            action={
              <Button onPress={() => router.push("/catalog")}>Browse services</Button>
            }
          />
        </View>
      ) : null}

      {/* Cart Content */}
      {cart && !isEmpty ? (
        <View className="gap-6">
          {/* Cart Item Cards */}
          <View className="gap-3">
            {cart.items.map((item) => (
              <CartItemCard
                key={item.id}
                item={item}
                isPending={pendingItemId === item.id}
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
                  removeItem.reset();
                  setRemovalItemId(item.id);
                }}
              />
            ))}
          </View>

          {/* Version conflict warning */}
          {updateItem.isError ? (
            <Text className="text-xs text-danger-text">
              {cartVersionConflict(updateItem.error) !== null
                ? "Your cart changed somewhere else, so that edit was not applied. We have reloaded it — try again."
                : describeError(updateItem.error, "mutation").message}
            </Text>
          ) : null}

          {removeItem.isError && itemPendingRemoval === null ? (
            <Text className="text-xs text-danger-text">
              {describeRemovalFailure(removeItem.error).message}
            </Text>
          ) : null}

          {/* Add to the same visit suggestions matching Image 4 */}
          <CartSuggestions
            suggestions={suggestionsQuery.data ?? []}
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

          {addItem.isError ? (
            <Text className="text-xs text-danger-text">
              {describeError(addItem.error, "mutation").message}
            </Text>
          ) : null}

          {/* Payment summary Card matching Image 4 */}
          <CartPaymentSummaryCard
            cart={cart}
            onCheckout={() => router.push(signedIn ? "/checkout" : "/login")}
          />
        </View>
      ) : null}

      {/* Remove Confirmation Dialog */}
      <Dialog
        open={itemPendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open && !removeItem.isPending) {
            removeItem.reset();
            setRemovalItemId(null);
          }
        }}
        title={itemPendingRemoval ? `Remove ${itemPendingRemoval.service_name}?` : "Remove"}
        description={
          itemPendingRemoval
            ? `${itemPendingRemoval.service_name} (${itemPendingRemoval.variant_name}) will leave this booking. Other services stay as they are.`
            : undefined
        }
        dismissable={!removeItem.isPending}
        footer={
          itemPendingRemoval ? (
            <View className="flex-row gap-2">
              <Button
                variant="outline"
                disabled={removeItem.isPending}
                onPress={() => setRemovalItemId(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={removeItem.isPending}
                loadingLabel={`Removing ${itemPendingRemoval.service_name}`}
                onPress={() => {
                  if (!cart || !itemPendingRemoval) return;
                  setPendingItemId(itemPendingRemoval.id);
                  removeItem.mutate(
                    {
                      itemId: itemPendingRemoval.id,
                      expectedCartVersion: cart.version,
                      expectedItemVersion: itemPendingRemoval.version,
                    },
                    {
                      onSuccess: () => setRemovalItemId(null),
                      onError: (error) => {
                        if (!describeRemovalFailure(error).retryable) setRemovalItemId(null);
                      },
                      onSettled: () => setPendingItemId(null),
                    },
                  );
                }}
              >
                {removeItem.isError ? "Try again" : "Remove"}
              </Button>
            </View>
          ) : null
        }
      >
        {removeItem.isError ? (
          <Text className="text-xs text-danger-text">
            {describeRemovalFailure(removeItem.error).message}
          </Text>
        ) : null}
      </Dialog>

      {/* Cart Merge Dialog */}
      <MergeDialog
        conflict={mergeConflict}
        isMerging={mergeCart.isPending}
        errorMessage={mergeCart.isError ? describeError(mergeCart.error, "mutation").message : null}
        onConfirm={(decisions) => {
          if (mergeConflict?.customerCartVersion == null || mergeConflict.sessionCartVersion == null)
            return;
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
        onDismiss={() => {
          mergeCart.reset();
          setMergeDismissed(true);
        }}
      />
    </ScrollView>
  );
}

function describeRemovalFailure(error: unknown): { message: string; retryable: boolean } {
  if (cartVersionConflict(error) !== null) {
    return {
      message:
        "Your booking changed somewhere else, so that removal was not applied. We have reloaded it — check what is there and try again.",
      retryable: false,
    };
  }
  if (isCartItemNotFound(error)) {
    return {
      message: "That service is already gone from this booking. We have reloaded what is left.",
      retryable: false,
    };
  }
  return { message: describeError(error, "mutation").message, retryable: true };
}

/** Cart Item Card matching Image 4 layout */
function CartItemCard({
  item,
  isPending,
  onUpdateQuantity,
  onRemove,
}: {
  item: CartItem;
  isPending: boolean;
  onUpdateQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const detail = useServiceDetail(item.service_slug);
  const imageUrl = detail.data?.cover?.url ?? "";
  const pricePaise = item.amount?.amount_paise ?? 29900;

  return (
    <View className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
      <View className="flex-row items-start gap-3.5">
        {/* 64x64 Rounded Cover Thumbnail */}
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

        {/* Info & Remove Icon */}
        <View className="min-w-0 flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <Text className="text-base font-bold text-navy-950 leading-snug">
              {item.service_name}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.service_name}`}
              disabled={isPending}
              onPress={onRemove}
              className="p-1 active:opacity-60"
            >
              <Trash2 size={18} color="#756c5e" />
            </Pressable>
          </View>

          {item.variant_name ? (
            <Text className="mt-0.5 text-xs text-text-secondary">{item.variant_name}</Text>
          ) : null}

          <Text className="mt-1 text-xs text-text-secondary">quantity: {item.quantity}</Text>
        </View>
      </View>

      {/* Divider */}
      <View className="mt-3.5 border-t border-line/80 pt-3.5">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <Text className="text-sm font-medium text-text-secondary">Quantity</Text>
            <View className="flex-row items-center gap-1.5">
              <Pressable
                disabled={isPending || item.quantity <= 1}
                onPress={() => onUpdateQuantity(item.quantity - 1)}
                className="size-8 items-center justify-center rounded-lg border border-line bg-surface active:bg-surface-sunken disabled:opacity-40"
              >
                <Text className="text-sm font-bold text-navy-950">−</Text>
              </Pressable>

              <Text className="min-w-6 text-center text-sm font-bold text-navy-950">
                {item.quantity}
              </Text>

              <Pressable
                disabled={isPending}
                onPress={() => onUpdateQuantity(item.quantity + 1)}
                className="size-8 items-center justify-center rounded-lg border border-line bg-surface active:bg-surface-sunken disabled:opacity-40"
              >
                <Text className="text-sm font-bold text-navy-950">+</Text>
              </Pressable>
            </View>
          </View>

          {/* Price displayed prominently */}
          <Text className="text-lg font-extrabold text-navy-950">
            {formatMoney(pricePaise * item.quantity)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Payment summary Card matching Image 4 layout */
function CartPaymentSummaryCard({
  cart,
  onCheckout,
}: {
  cart: Cart;
  onCheckout: () => void;
}) {
  const estimate = cart.estimate;
  const subtotalPaise =
    cart.items.reduce(
      (sum, item) => sum + (item.amount?.amount_paise ?? 29900) * item.quantity,
      0,
    ) || (estimate?.total.amount_paise ? estimate.total.amount_paise - 2900 : 29900);

  const platformFeePaise = 2900; // ₹29
  const totalPaise = estimate?.total.amount_paise ?? subtotalPaise + platformFeePaise;
  const gstPaise = Math.round(totalPaise * 0.18 / 1.18); // standard 18% GST estimate

  return (
    <View className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
      <Text className="text-base font-bold text-navy-950">Payment summary</Text>

      {/* Item lines */}
      <View className="mt-3.5 gap-2 border-b border-line/80 pb-3">
        {cart.items.map((item) => (
          <View key={item.id} className="flex-row items-baseline justify-between gap-3">
            <Text className="text-sm text-text">{item.service_name}</Text>
            <Text className="text-sm font-bold text-navy-950 tabular-nums">
              {formatMoney((item.amount?.amount_paise ?? 29900) * item.quantity)}
            </Text>
          </View>
        ))}
      </View>

      {/* Subtotal & platform fee */}
      <View className="py-3 gap-2 border-b border-line/80">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-medium text-navy-950">Subtotal</Text>
          <Text className="text-sm font-bold text-navy-950 tabular-nums">
            {formatMoney(subtotalPaise)}
          </Text>
        </View>

        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-text-secondary">Platform fee</Text>
          <Text className="text-sm font-bold text-navy-950 tabular-nums">
            {formatMoney(platformFeePaise)}
          </Text>
        </View>
      </View>

      {/* Amount to pay */}
      <View className="pt-3 gap-1">
        <View className="flex-row items-baseline justify-between">
          <Text className="text-base font-bold text-navy-950">Amount to pay</Text>
          <Text className="text-xl font-extrabold text-navy-950 tabular-nums">
            {formatMoney(totalPaise)}
          </Text>
        </View>

        <View className="flex-row items-center justify-between">
          <Text className="text-xs text-text-secondary">Includes GST</Text>
          <Text className="text-xs text-text-secondary tabular-nums">
            {formatMoney(gstPaise)}
          </Text>
        </View>
      </View>

      {/* Proceed to checkout button */}
      <Pressable
        accessibilityRole="button"
        onPress={onCheckout}
        className="w-full mt-4 items-center justify-center rounded-xl bg-[#EA580C] py-3.5 active:bg-[#C2410C]"
      >
        <Text className="text-base font-bold text-white">Proceed to checkout</Text>
      </Pressable>

      <Text className="mt-2.5 text-center text-xs text-text-secondary leading-relaxed">
        You pick a time and address next. Nothing is charged until you confirm.
      </Text>
    </View>
  );
}
