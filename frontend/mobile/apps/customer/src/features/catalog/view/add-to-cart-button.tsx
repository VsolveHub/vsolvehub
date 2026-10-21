// Ported from frontend/apps/customer/features/catalog/components/add-to-cart-button.tsx
import { Text, cn } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { useAddCartItem, useCart, useRemoveCartItem, useUpdateCartItem } from "@/features/checkout/queries";

type AddToCartButtonProps = {
  variantId: string;
  className?: string;
  size?: "default" | "compact";
};

const DEFAULT_CLASS =
  "h-11 w-full flex-row items-center justify-center rounded-xl bg-navy-900 px-6 shadow-xs active:scale-[0.98] disabled:opacity-50";

const COMPACT_CLASS =
  "min-h-10 shrink-0 flex-row items-center justify-center rounded-xl bg-navy-900 px-5 shadow-xs active:scale-[0.98] disabled:opacity-50";

export function AddToCartButton({ variantId, className, size = "default" }: AddToCartButtonProps) {
  const router = useRouter();
  const cartQuery = useCart();
  const addItem = useAddCartItem();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();

  const isAdding = addItem.isPending;
  const isUpdating = updateItem.isPending;
  const isRemoving = removeItem.isPending;

  const cart = cartQuery.data;
  const cartItem = cart?.items.find((item) => item.variant_id === variantId);
  const cartUnavailable = cartQuery.isLoading || cart === undefined;

  const handleAddToCart = () => {
    if (isAdding || cartUnavailable || !cart) return;
    addItem.mutate({
      expectedCartVersion: cart.version,
      variantId,
      quantity: 1,
    });
  };

  const handleIncrement = () => {
    if (cart && cartItem && !isUpdating) {
      updateItem.mutate({
        expectedCartVersion: cart.version,
        expectedItemVersion: cartItem.version,
        itemId: cartItem.id,
        quantity: cartItem.quantity + 1,
      });
    }
  };

  const handleDecrement = () => {
    if (cart && cartItem && !isUpdating && !isRemoving) {
      if (cartItem.quantity > 1) {
        updateItem.mutate({
          expectedCartVersion: cart.version,
          expectedItemVersion: cartItem.version,
          itemId: cartItem.id,
          quantity: cartItem.quantity - 1,
        });
      } else {
        removeItem.mutate({
          expectedCartVersion: cart.version,
          expectedItemVersion: cartItem.version,
          itemId: cartItem.id,
        });
      }
    }
  };

  if (cartItem) {
    const isCompact = size === "compact";
    const quantityShellClass = isCompact
      ? "min-h-10 shrink-0 flex-row items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 shadow-2xs"
      : "h-11 w-full flex-row items-center justify-between gap-4 rounded-xl border-2 border-line bg-white px-4 shadow-2xs";

    return (
      <View className={cn(quantityShellClass, className)}>
        {/* View Cart link */}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="View Cart"
          onPress={() => router.push("/cart" as never)}
          hitSlop={6}
          className="flex-row items-center gap-1 active:opacity-75"
        >
          <Text className="text-xs font-bold text-[#EA580C]">View Cart</Text>
          <Svg viewBox="0 0 20 20" width={12} height={12} fill="none">
            <Path d="m7.5 4.5 5.5 5.5-5.5 5.5" stroke="#EA580C" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>

        {/* Quantity Stepper Controller */}
        <View className="flex-row items-center gap-1.5">
          {/* Minus Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove one"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={handleDecrement}
            disabled={isUpdating || isRemoving}
            className="size-7 items-center justify-center rounded-lg bg-[#FFF6ED] active:bg-[#FFE5D3] disabled:opacity-40"
          >
            <Svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="#EA580C" strokeWidth={2.5} strokeLinecap="round">
              <Path d="M5 12h14" />
            </Svg>
          </Pressable>

          {/* Quantity Number */}
          <View className="min-w-[20px] items-center justify-center">
            <Text className="text-xs font-black tabular-nums text-navy-900">
              {cartItem.quantity}
            </Text>
          </View>

          {/* Plus Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add one"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={handleIncrement}
            disabled={isUpdating}
            className="size-7 items-center justify-center rounded-lg bg-[#FFF6ED] active:bg-[#FFE5D3] disabled:opacity-40"
          >
            <Svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="#EA580C" strokeWidth={2.5} strokeLinecap="round">
              <Path d="M12 5v14M5 12h14" />
            </Svg>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={handleAddToCart}
      disabled={isAdding}
      className={cn(size === "compact" ? COMPACT_CLASS : DEFAULT_CLASS, className)}
    >
      <Text className={size === "compact" ? "text-xs font-bold text-white" : "text-sm font-bold text-white"}>
        {isAdding ? "Adding to Cart..." : "Add to Cart"}
      </Text>
    </Pressable>
  );
}
