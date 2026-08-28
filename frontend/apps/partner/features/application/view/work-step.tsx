"use client";

import { useMemo } from "react";
import { ErrorState, Spinner } from "@vsolve/ui";

import { useApplicationEditor } from "./application-editor";
import type { MainCategory, OfferableService } from "@/features/catalog/queries";
import {
  isCategorySelected,
  toggleCategorySelection,
} from "../model/main-categories";
import { useApplicationReference } from "../reference-queries";
import { SelectableRow } from "./selectable-row";

export interface WorkStepProps {
  mainCategories: readonly MainCategory[];
  services: readonly OfferableService[];
}

export function WorkStep({ mainCategories, services }: WorkStepProps) {
  const { draft, update, isReadOnly } = useApplicationEditor();
  const reference = useApplicationReference();

  const selectedCategoryCount = useMemo(
    () =>
      mainCategories.filter((category) =>
        isCategorySelected(
          category,
          reference.skills,
          services,
          draft.skillCodes,
          draft.serviceVariantIds,
        ),
      ).length,
    [mainCategories, draft.serviceVariantIds, draft.skillCodes, reference.skills, services],
  );

  return (
    <fieldset className="border-0 p-0">
      <legend className="text-sm font-bold text-navy-900">
        Select Your Trades <span className="text-danger-text">*</span>
      </legend>
      <p className="mt-1 text-xs leading-5 text-text-muted">
        Choose the categories you work in.
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
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {mainCategories.map((category) => {
            const checked = isCategorySelected(
              category,
              reference.skills,
              services,
              draft.skillCodes,
              draft.serviceVariantIds,
            );

            return (
              <SelectableRow
                key={category.id}
                checked={checked}
                disabled={isReadOnly}
                onChange={() =>
                  update(
                    toggleCategorySelection(
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
            );
          })}
        </div>
      )}

      {selectedCategoryCount === 0 ? (
        <p className="mt-2 text-xs font-semibold text-danger-text">
          * Please select at least one category to proceed.
        </p>
      ) : null}
    </fieldset>
  );
}
