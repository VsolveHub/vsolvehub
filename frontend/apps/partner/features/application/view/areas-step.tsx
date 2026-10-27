"use client";

import { ErrorState, Spinner, useT } from "@vsolve/ui";
import { useApplicationEditor } from "./application-editor";
import { useApplicationReference } from "../reference-queries";
import { toggle } from "../model/draft";
import { SelectableRow } from "./selectable-row";

export function AreasStep() {
  const t = useT();
  const { draft, update, isReadOnly } = useApplicationEditor();
  const reference = useApplicationReference();

  if (reference.isPending) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-text-secondary">
        <Spinner size="sm" />
        {t("apply.areas.loading")}
      </p>
    );
  }

  if (reference.isError) {
    return (
      <ErrorState
        title={t("apply.areas.loadError.title")}
        message={t("apply.common.checkConnectionAndRetry")}
        actionLabel={t("common.tryAgain")}
        onAction={reference.refetch}
      />
    );
  }

  if (reference.serviceAreas.length === 0) {
    return (
      <p
        role="status"
        className="rounded-control border border-line bg-surface p-4 text-sm text-text-secondary"
      >
        {t("apply.areas.empty")}
      </p>
    );
  }

  const allAreaIds = reference.serviceAreas.map((a) => a.id);
  const allSelected =
    allAreaIds.length > 0 && allAreaIds.every((id) => draft.serviceAreaIds.includes(id));
  const selectedCount = draft.serviceAreaIds.length;

  return (
    <fieldset className="border-0 p-0 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <legend className="text-sm font-bold text-navy-900">
          {t("apply.areas.legend")} <span className="text-danger-text">*</span>
        </legend>

        {!isReadOnly && reference.serviceAreas.length > 1 && (
          <button
            type="button"
            onClick={() => {
              if (allSelected) {
                update({ serviceAreaIds: [] });
              } else {
                update({ serviceAreaIds: allAreaIds });
              }
            }}
            className="text-xs font-semibold text-navy-700 hover:text-signal-700"
          >
            {allSelected ? t("apply.areas.deselectAll") : t("apply.areas.selectAll")}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {reference.serviceAreas.map((area) => (
          <SelectableRow
            key={area.id}
            checked={draft.serviceAreaIds.includes(area.id)}
            disabled={isReadOnly}
            onChange={() =>
              update({ serviceAreaIds: toggle(draft.serviceAreaIds, area.id) })
            }
            label={area.name}
            caption={area.timezone || undefined}
          />
        ))}
      </div>

      {selectedCount === 0 && (
        <p className="text-xs font-semibold text-danger-text mt-1">
          {t("apply.areas.selectAtLeastOne")}
        </p>
      )}
    </fieldset>
  );
}
