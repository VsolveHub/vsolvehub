import { COLOR_TOKENS, Text } from "@vsolve/mobile-ui";
import { RotateCcw, Search, X } from "lucide-react-native";
import { Pressable, TextInput, View } from "react-native";

import type { PlaceFilterValue } from "@/features/browse/nearby";
import { PlaceFilter } from "@/features/browse/place-filter";
import type { RentalTaxonomyService } from "../model";

const PRICE_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: "Any rate" },
  { label: "Under ₹500", max: 50_000 },
  { label: "₹500 – ₹1,500", min: 50_000, max: 150_000 },
  { label: "₹1,500+", min: 150_000 },
];

export interface RentalSidebarFiltersProps {
  draftQuery: string;
  onDraftQueryChange: (q: string) => void;
  onSearchSubmit: () => void;
  draftPlace: PlaceFilterValue;
  onPlaceChange: (place: PlaceFilterValue, applyNow: boolean) => void;
  nestedServices: RentalTaxonomyService[];
  selectedService: string | null;
  onSelectService: (slug: string | null) => void;
  minPrice?: number;
  maxPrice?: number;
  onPriceChange: (min?: number, max?: number) => void;
  isFiltering: boolean;
  onClearFilters: () => void;
}

export function RentalSidebarFilters({
  draftQuery,
  onDraftQueryChange,
  onSearchSubmit,
  draftPlace,
  onPlaceChange,
  nestedServices,
  selectedService,
  onSelectService,
  minPrice,
  maxPrice,
  onPriceChange,
  isFiltering,
  onClearFilters,
}: RentalSidebarFiltersProps) {
  return (
    <View className="gap-4">
      {/* Search box */}
      <View className="gap-1.5">
        <Text className="text-xs font-bold text-navy-900">Search equipment</Text>
        <View className="flex-row items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
          <Search size={15} color={COLOR_TOKENS.textMuted} />
          <TextInput
            value={draftQuery}
            onChangeText={onDraftQueryChange}
            onSubmitEditing={onSearchSubmit}
            returnKeyType="search"
            placeholder="Search tools, cameras, AC..."
            placeholderTextColor={COLOR_TOKENS.textMuted}
            className="flex-1 text-xs text-navy-900"
          />
          {draftQuery ? (
            <Pressable
              hitSlop={8}
              onPress={() => {
                onDraftQueryChange("");
                onSearchSubmit();
              }}
            >
              <X size={14} color={COLOR_TOKENS.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Location / Place filter */}
      <View className="gap-1.5">
        <Text className="text-xs font-bold text-navy-900">Location</Text>
        <PlaceFilter value={draftPlace} onChange={onPlaceChange} />
      </View>

      {/* Nested Equipment Types when a category is active */}
      {nestedServices.length > 0 ? (
        <View className="gap-2">
          <Text className="text-xs font-bold text-navy-900">Equipment type</Text>
          <View className="flex-row flex-wrap gap-1.5">
            <Pressable
              onPress={() => onSelectService(null)}
              className={`rounded-full border px-2.5 py-1 ${!selectedService
                  ? "border-navy-900 bg-navy-900"
                  : "border-line bg-surface"
                }`}
            >
              <Text
                className={`text-[11px] font-semibold ${!selectedService ? "text-white" : "text-navy-900"
                  }`}
              >
                All types
              </Text>
            </Pressable>
            {nestedServices.map((svc) => {
              const active = selectedService === svc.slug;
              return (
                <Pressable
                  key={svc.id}
                  onPress={() => onSelectService(active ? null : svc.slug)}
                  className={`rounded-full border px-2.5 py-1 ${active
                      ? "border-navy-900 bg-navy-900"
                      : "border-line bg-surface"
                    }`}
                >
                  <Text
                    className={`text-[11px] font-semibold ${active ? "text-white" : "text-navy-900"
                      }`}
                  >
                    {svc.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Daily Rate Filter */}
      <View className="gap-2">
        <Text className="text-xs font-bold text-navy-900">Daily rate</Text>
        <View className="flex-row flex-wrap gap-1.5">
          {PRICE_PRESETS.map((preset) => {
            const active = minPrice === preset.min && maxPrice === preset.max;
            return (
              <Pressable
                key={preset.label}
                onPress={() => onPriceChange(preset.min, preset.max)}
                className={`rounded-full border px-2.5 py-1 ${active
                    ? "border-navy-900 bg-navy-900"
                    : "border-line bg-surface"
                  }`}
              >
                <Text
                  className={`text-[11px] font-semibold ${active ? "text-white" : "text-navy-900"
                    }`}
                >
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Clear Filters */}
      {isFiltering ? (
        <Pressable
          accessibilityRole="button"
          onPress={onClearFilters}
          className="flex-row items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-sunken py-2 active:bg-line"
        >
          <RotateCcw size={13} color="#0B1B3D" />
          <Text className="text-xs font-bold text-navy-900">Clear all filters</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

