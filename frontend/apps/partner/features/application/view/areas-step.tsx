"use client";

import { ErrorState, Spinner } from "@vsolve/ui";
import { useApplicationEditor } from "./application-editor";
import { useApplicationReference } from "../reference-queries";
import { toggle } from "../model/draft";
import { SelectableRow } from "./selectable-row";

export function AreasStep() {
  const { draft, update, isReadOnly } = useApplicationEditor();
  const reference = useApplicationReference();

  if (reference.isPending) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-text-secondary">
        <Spinner size="sm" />
        Loading service areas…
      </p>
    );
  }

  if (reference.isError) {
    return (
      <ErrorState
        title="Could not load service areas"
        message="Check your connection and try again."
        actionLabel="Try again"
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
        No service areas are currently available for registration.
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
          Service Locations <span className="text-danger-text">*</span>
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
            {allSelected ? "Deselect all" : "Select all"}
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
          * Please select at least one service location.
        </p>
      )}
    </fieldset>
  );
}
