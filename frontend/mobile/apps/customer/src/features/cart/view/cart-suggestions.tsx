// Ported from frontend/apps/customer/features/cart/view/cart-suggestions.tsx
import { Button, Text, formatMoney } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";

import type { ServiceCard } from "@/features/catalog/client-queries";

export function CartSuggestions({
  suggestions,
  onAdd,
  addingVariantId,
  isAdding,
}: {
  suggestions: readonly ServiceCard[];
  onAdd: (variantId: string) => void;
  addingVariantId: string | null;
  isAdding: boolean;
}) {
  const router = useRouter();
  if (suggestions.length === 0) return null;

  return (
    <View className="mt-6">
      <Text className="text-base font-bold text-text">Add to the same visit</Text>
      <Text className="mt-1 text-sm text-text-secondary">
        The same professional can do these while they are with you, so there is no second visit fee.
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pt-4">
        {suggestions.map((card) => (
          <View key={card.slug} className="w-56 rounded-card border border-line bg-surface p-4">
            <Pressable accessibilityRole="link" onPress={() => router.push(`/catalog/${card.category_slug}/${card.slug}` as never)}>
              <Text className="text-sm font-semibold text-text">{card.name}</Text>
              <Text className="mt-1 text-xs text-text-secondary" numberOfLines={2}>
                {card.short_description}
              </Text>
            </Pressable>
            <View className="mt-3">
              {card.starting_price !== null ? (
                <Text className="text-base font-bold text-text">
                  <Text className="text-[0.6875rem] uppercase tracking-[0.08em] text-text-muted">Starts at </Text>
                  {formatMoney(card.starting_price.amount_paise)}
                </Text>
              ) : null}
              {card.bookable_variant_id !== null ? (
                <Button
                  variant="secondary"
                  size="sm"
                  block
                  className="mt-2"
                  loading={isAdding && addingVariantId === card.bookable_variant_id}
                  disabled={isAdding}
                  onPress={() => onAdd(card.bookable_variant_id as string)}
                >
                  Add
                </Button>
              ) : (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push(`/catalog/${card.category_slug}/${card.slug}` as never)}
                  className="mt-2 items-center rounded-md border border-line-strong px-3 py-1.5"
                >
                  <Text className="text-xs font-semibold text-text">Choose an option</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
