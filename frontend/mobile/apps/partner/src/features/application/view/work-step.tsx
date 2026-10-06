// Ported from frontend/apps/partner/features/application/view/work-step.tsx
import { Badge, ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useMemo } from "react";
import { Pressable, View } from "react-native";

import type { MainCategory, OfferableService } from "@/features/catalog/queries";

import { toggle } from "../model/draft";
import {
  isTradeCategorySelected,
  selectedTradeCategories,
  toggleTradeCategorySelection,
  variantIdsForCategory,
} from "../model/main-categories";
import { useApplicationReference } from "../reference-queries";
import { useApplicationEditor, useProceedDisabled } from "./application-editor";
import { SelectableRow } from "./selectable-row";

export interface WorkStepProps {
  mainCategories: readonly MainCategory[];
  services: readonly OfferableService[];
}

function servicesForCategory(category: MainCategory, catalog: readonly OfferableService[]): OfferableService[] {
  return catalog.filter((service) => service.categoryName === category.name);
}

export function WorkStep({ mainCategories, services }: WorkStepProps) {
  const { draft, update, isReadOnly } = useApplicationEditor();
  const reference = useApplicationReference();

  const selectedCategories = useMemo(
    () => selectedTradeCategories(mainCategories, reference.skills, draft.skillCodes),
    [draft.skillCodes, mainCategories, reference.skills],
  );

  const selectableServices = useMemo(() => {
    const activeNames = new Set(selectedCategories.map((category) => category.name));
    return services.filter((service) => activeNames.has(service.categoryName));
  }, [selectedCategories, services]);

  const selectedServiceCount = useMemo(
    () =>
      draft.serviceVariantIds.filter((id) => selectableServices.some((service) => service.variantId === id))
        .length,
    [draft.serviceVariantIds, selectableServices],
  );

  useProceedDisabled(
    selectedCategories.length === 0 || (selectableServices.length > 0 && selectedServiceCount === 0),
  );

  return (
    <View>
      <Text className="text-sm font-bold text-navy-900">
        Select Your Trades <Text className="text-danger-text">*</Text>
      </Text>
      <Text className="mt-1 text-xs leading-5 text-text-muted">
        Choose your main categories, then pick the job types you want under each one.
      </Text>

      {reference.isPending ? (
        <View className="mt-3 flex-row items-center gap-2 py-4">
          <Spinner size="sm" />
          <Text className="text-sm text-text-secondary">Loading categories…</Text>
        </View>
      ) : reference.isError ? (
        <ErrorState
          className="mt-3"
          inline
          title="Could not load categories"
          message="Check your connection and try again."
          actionLabel="Try again"
          onAction={reference.refetch}
        />
      ) : mainCategories.length === 0 ? (
        <Text className="mt-3 rounded-control border border-line bg-surface p-4 text-sm text-text-secondary">
          No categories are currently open for registration.
        </Text>
      ) : (
        <View className="mt-3 flex-col gap-4">
          {mainCategories.map((category) => {
            const checked = isTradeCategorySelected(category, reference.skills, draft.skillCodes);
            const categoryServices = servicesForCategory(category, services);
            const allCategoryIds = variantIdsForCategory(category.name, services);
            const allServicesSelected =
              allCategoryIds.length > 0 && allCategoryIds.every((id) => draft.serviceVariantIds.includes(id));

            return (
              <View key={category.id} className="flex-col gap-2.5">
                <SelectableRow
                  checked={checked}
                  disabled={isReadOnly}
                  onChange={() =>
                    update(
                      toggleTradeCategorySelection(
                        category,
                        reference.skills,
                        services,
                        draft.skillCodes,
                        draft.serviceVariantIds,
                      ),
                    )
                  }
                  label={category.name}
                />

                {checked ? (
                  categoryServices.length > 0 ? (
                    <View className="ml-1 flex-col gap-2 border-l-2 border-line pl-3">
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                          Job types
                        </Text>
                        {!isReadOnly ? (
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                              if (allServicesSelected) {
                                update({
                                  serviceVariantIds: draft.serviceVariantIds.filter(
                                    (id) => !allCategoryIds.includes(id),
                                  ),
                                });
                              } else {
                                update({
                                  serviceVariantIds: Array.from(
                                    new Set([...draft.serviceVariantIds, ...allCategoryIds]),
                                  ),
                                });
                              }
                            }}
                          >
                            <Text className="text-xs font-semibold text-navy-700">
                              {allServicesSelected ? "Deselect all" : "Select all"}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>

                      <View className="flex-col gap-2">
                        {categoryServices.map((service) => {
                          const needsSkill =
                            service.requiredSkillCode.length > 0 &&
                            !draft.skillCodes.includes(service.requiredSkillCode);
                          return (
                            <View key={service.variantId} className="flex-col gap-1">
                              <SelectableRow
                                checked={draft.serviceVariantIds.includes(service.variantId)}
                                disabled={isReadOnly}
                                onChange={() =>
                                  update({
                                    serviceVariantIds: toggle(draft.serviceVariantIds, service.variantId),
                                  })
                                }
                                label={service.variantName}
                                caption={service.serviceName}
                              />
                              {needsSkill && draft.serviceVariantIds.includes(service.variantId) ? (
                                <Badge tone="warning">
                                  Requires {service.requiredSkillCode.replace(/-/g, " ")} trade
                                </Badge>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ) : (
                    <Text className="ml-1 border-l-2 border-line pl-3 text-xs leading-5 text-text-secondary">
                      No bookable job types are open for this category yet.
                    </Text>
                  )
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {selectedCategories.length === 0 ? (
        <Text className="mt-3 text-xs font-semibold text-danger-text">
          * Please select at least one category to proceed.
        </Text>
      ) : selectableServices.length > 0 && selectedServiceCount === 0 ? (
        <Text className="mt-3 text-xs font-semibold text-danger-text">
          * Please select at least one job type under your chosen categories.
        </Text>
      ) : null}
    </View>
  );
}
