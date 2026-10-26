"use client";

import { useMemo } from "react";
import { Badge, ErrorState, Spinner } from "@vsolve/ui";

import { useApplicationEditor, useProceedDisabled } from "./application-editor";
import type { MainCategory, OfferableService } from "@/features/catalog/queries";
import { toggle } from "../model/draft";
import {
  findSkillForCategory,
  isTradeCategorySelected,
  selectedTradeCategories,
  syncRequiredSkills,
  toggleTradeCategorySelection,
  variantIdsForCategory,
} from "../model/main-categories";
import { useApplicationReference } from "../reference-queries";
import { SelectableRow } from "./selectable-row";

export interface WorkStepProps {
  mainCategories: readonly MainCategory[];
  services: readonly OfferableService[];
}

function servicesForCategory(
  category: MainCategory,
  catalog: readonly OfferableService[],
): OfferableService[] {
  return catalog.filter((service) => service.categoryName === category.name);
}

export function WorkStep({ mainCategories, services }: WorkStepProps) {
  const { draft, update, isReadOnly } = useApplicationEditor();
  const reference = useApplicationReference();

  const selectedCategories = useMemo(
    () => selectedTradeCategories(mainCategories, reference.skills, draft.skillCodes),
    [draft.skillCodes, mainCategories, reference.skills],
  );

  const categorySkillCodes = useMemo(
    () =>
      mainCategories
        .map((category) => findSkillForCategory(reference.skills, category)?.code)
        .filter((code): code is string => code !== undefined),
    [mainCategories, reference.skills],
  );

  // Every change to the selection goes through here, so the skills the chosen
  // job types need travel with them. See `syncRequiredSkills`.
  function select(next: { skillCodes?: readonly string[]; serviceVariantIds: readonly string[] }) {
    update({
      serviceVariantIds: [...next.serviceVariantIds],
      skillCodes: syncRequiredSkills({
        skillCodes: next.skillCodes ?? draft.skillCodes,
        previousVariantIds: draft.serviceVariantIds,
        nextVariantIds: next.serviceVariantIds,
        services,
        skills: reference.skills,
        categorySkillCodes,
      }),
    });
  }

  const selectableServices = useMemo(() => {
    const activeNames = new Set(selectedCategories.map((category) => category.name));
    return services.filter((service) => activeNames.has(service.categoryName));
  }, [selectedCategories, services]);

  const selectedServiceCount = useMemo(
    () =>
      draft.serviceVariantIds.filter((id) =>
        selectableServices.some((service) => service.variantId === id),
      ).length,
    [draft.serviceVariantIds, selectableServices],
  );

  useProceedDisabled(
    selectedCategories.length === 0 ||
      (selectableServices.length > 0 && selectedServiceCount === 0),
  );

  return (
    <fieldset className="border-0 p-0">
      <legend className="text-sm font-bold text-navy-900">
        Select Your Trades <span className="text-danger-text">*</span>
      </legend>
      <p className="mt-1 text-xs leading-5 text-text-muted">
        Choose your main categories, then pick the job types you want under each one.
      </p>

      {reference.isPending ? (
        <p className="mt-3 flex items-center gap-2 py-4 text-sm text-text-secondary">
          <Spinner size="sm" />
          Loading categories…
        </p>
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
        <p className="mt-3 rounded-control border border-line bg-surface p-4 text-sm text-text-secondary">
          No categories are currently open for registration.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {mainCategories.map((category) => {
            const checked = isTradeCategorySelected(
              category,
              reference.skills,
              draft.skillCodes,
            );
            const categoryServices = servicesForCategory(category, services);
            const allCategoryIds = variantIdsForCategory(category.name, services);
            const allServicesSelected =
              allCategoryIds.length > 0 &&
              allCategoryIds.every((id) => draft.serviceVariantIds.includes(id));

            return (
              <div key={category.id} className="flex flex-col gap-2.5">
                <SelectableRow
                  checked={checked}
                  disabled={isReadOnly}
                  onChange={() =>
                    select(
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
                    <div className="ml-1 flex flex-col gap-2 border-l-2 border-line pl-3 sm:ml-2 sm:pl-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                          Job types
                        </p>
                        {!isReadOnly ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (allServicesSelected) {
                                select({
                                  serviceVariantIds: draft.serviceVariantIds.filter(
                                    (id) => !allCategoryIds.includes(id),
                                  ),
                                });
                              } else {
                                select({
                                  serviceVariantIds: Array.from(
                                    new Set([...draft.serviceVariantIds, ...allCategoryIds]),
                                  ),
                                });
                              }
                            }}
                            className="text-xs font-semibold text-navy-700 hover:text-signal-700"
                          >
                            {allServicesSelected ? "Deselect all" : "Select all"}
                          </button>
                        ) : null}
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {categoryServices.map((service) => {
                          const needsSkill =
                            service.requiredSkillCode.length > 0 &&
                            !draft.skillCodes.includes(service.requiredSkillCode) &&
                            !reference.skills.some(
                              (skill) => skill.code === service.requiredSkillCode,
                            );

                          return (
                            <div key={service.variantId} className="flex flex-col gap-1">
                              <SelectableRow
                                checked={draft.serviceVariantIds.includes(service.variantId)}
                                disabled={isReadOnly}
                                onChange={() =>
                                  select({
                                    serviceVariantIds: toggle(
                                      draft.serviceVariantIds,
                                      service.variantId,
                                    ),
                                  })
                                }
                                label={service.variantName}
                                caption={service.serviceName}
                              />
                              {needsSkill &&
                              draft.serviceVariantIds.includes(service.variantId) ? (
                                // Only reachable now when the skill is not one
                                // Django offers: `select` adds every other one.
                                <Badge tone="warning">
                                  Not open to new applicants yet. Untick it to continue.
                                </Badge>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="ml-1 border-l-2 border-line pl-3 text-xs leading-5 text-text-secondary sm:ml-2 sm:pl-4">
                      No bookable job types are open for this category yet.
                    </p>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {selectedCategories.length === 0 ? (
        <p className="mt-3 text-xs font-semibold text-danger-text">
          * Please select at least one category to proceed.
        </p>
      ) : selectableServices.length > 0 && selectedServiceCount === 0 ? (
        <p className="mt-3 text-xs font-semibold text-danger-text">
          * Please select at least one job type under your chosen categories.
        </p>
      ) : null}
    </fieldset>
  );
}
