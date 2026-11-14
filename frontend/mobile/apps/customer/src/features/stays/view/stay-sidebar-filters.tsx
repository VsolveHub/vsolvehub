import { COLOR_TOKENS, Text } from "@vsolve/mobile-ui";
import { RotateCcw, Search, X } from "lucide-react-native";
import { Pressable, TextInput, View } from "react-native";

import type { PlaceFilterValue } from "@/features/browse/nearby";
import { PlaceFilter } from "@/features/browse/place-filter";
import {
  SORT_OPTIONS,
  TENANT_PREFERENCES,
  type StayTaxonomyService,
} from "../model";

export interface StaySidebarFiltersProps {
  draftQuery: string;
  onDraftQueryChange: (q: string) => void;
  onSearchSubmit: () => void;
  draftPlace: PlaceFilterValue;
  onPlaceChange: (place: PlaceFilterValue, applyNow: boolean) => void;
  subServices: StayTaxonomyService[];
  selectedServiceSlug?: string;
  onSelectServiceSlug: (slug?: string) => void;
  filterAc?: boolean;
  onToggleAc: () => void;
  filterFood?: boolean;
  onToggleFood: () => void;
  tenantPreference?: string;
  onSelectTenantPreference: (val?: string) => void;
  sort: string;
  onSelectSort: (val: string) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export function StaySidebarFilters({
  draftQuery,
  onDraftQueryChange,
  onSearchSubmit,
  draftPlace,
  onPlaceChange,
  subServices,
  selectedServiceSlug,
  onSelectServiceSlug,
  filterAc,
  onToggleAc,
  filterFood,
  onToggleFood,
  tenantPreference,
  onSelectTenantPreference,
  sort,
  onSelectSort,
  hasActiveFilters,
  onClearFilters,
}: StaySidebarFiltersProps) {
  return (
    <View className="gap-4">
      {/* Search box */}
      <View className="gap-1.5">
        <Text className="text-xs font-bold text-navy-900">Filter stays</Text>
        <View className="flex-row items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
          <Search size={15} color={COLOR_TOKENS.textMuted} />
          <TextInput
            value={draftQuery}
            onChangeText={onDraftQueryChange}
            onSubmitEditing={onSearchSubmit}
            returnKeyType="search"
            placeholder="Search stays, PG, hostels..."
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

      {/* Sub-services when a stay category is active */}
      {subServices.length > 0 ? (
        <View className="gap-2">
          <Text className="text-xs font-bold text-navy-900">Stay option</Text>
          <View className="flex-row flex-wrap gap-1.5">
            <Pressable
              onPress={() => onSelectServiceSlug(undefined)}
              className={`rounded-full border px-2.5 py-1 ${!selectedServiceSlug
                  ? "border-navy-900 bg-navy-900"
                  : "border-line bg-surface"
                }`}
            >
              <Text
                className={`text-[11px] font-semibold ${!selectedServiceSlug ? "text-white" : "text-navy-900"
                  }`}
              >
                All
              </Text>
            </Pressable>
            {subServices.map((svc) => {
              const active = selectedServiceSlug === svc.slug;
              return (
                <Pressable
                  key={svc.id}
                  onPress={() => onSelectServiceSlug(active ? undefined : svc.slug)}
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

      {/* Amenities (AC / Food) */}
      <View className="gap-2">
        <Text className="text-xs font-bold text-navy-900">Amenities</Text>
        <View className="flex-row flex-wrap gap-1.5">
          <Pressable
            onPress={onToggleAc}
            className={`rounded-full border px-2.5 py-1 ${filterAc === true
                ? "border-navy-900 bg-navy-900"
                : "border-line bg-surface"
              }`}
          >
            <Text
              className={`text-[11px] font-semibold ${filterAc === true ? "text-white" : "text-navy-900"
                }`}
            >
              AC rooms
            </Text>
          </Pressable>
          <Pressable
            onPress={onToggleFood}
            className={`rounded-full border px-2.5 py-1 ${filterFood === true
                ? "border-navy-900 bg-navy-900"
                : "border-line bg-surface"
              }`}
          >
            <Text
              className={`text-[11px] font-semibold ${filterFood === true ? "text-white" : "text-navy-900"
                }`}
            >
              Food included
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Tenant Preference */}
      <View className="gap-2">
        <Text className="text-xs font-bold text-navy-900">Preference</Text>
        <View className="flex-row flex-wrap gap-1.5">
          {TENANT_PREFERENCES.map((pref) => {
            const active = tenantPreference === pref.value;
            return (
              <Pressable
                key={pref.value}
                onPress={() =>
                  onSelectTenantPreference(active ? undefined : pref.value)
                }
                className={`rounded-full border px-2.5 py-1 ${active
                    ? "border-navy-900 bg-navy-900"
                    : "border-line bg-surface"
                  }`}
              >
                <Text
                  className={`text-[11px] font-semibold ${active ? "text-white" : "text-navy-900"
                    }`}
                >
                  {pref.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Sort */}
      <View className="gap-2">
        <Text className="text-xs font-bold text-navy-900">Sort by</Text>
        <View className="flex-row flex-wrap gap-1.5">
          {SORT_OPTIONS.map((opt) => {
            const active = sort === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => onSelectSort(opt.value)}
                className={`rounded-full border px-2.5 py-1 ${active
                    ? "border-navy-900 bg-navy-900"
                    : "border-line bg-surface"
                  }`}
              >
                <Text
                  className={`text-[11px] font-semibold ${active ? "text-white" : "text-navy-900"
                    }`}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Clear */}
      {hasActiveFilters ? (
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

