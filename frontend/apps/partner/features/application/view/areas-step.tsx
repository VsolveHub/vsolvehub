"use client";

import { ErrorState, Spinner } from "@vsolve/ui";

import { useApplicationEditor } from "./application-editor";

import { useApplicationReference } from "../reference-queries";
import { toggle } from "../model/draft";
import { SelectableRow } from "./selectable-row";

/**
 * Where the applicant is willing to travel.
 *
 * Every option comes from `GET /api/v1/service-areas/`, which publishes only
 * areas currently accepting Partners. An area at capacity stops appearing
 * without a frontend change — the same way a deactivated service already does —
 * so this screen never offers somewhere the platform cannot actually place them.
 *
 * Nothing here invents an id. Before contract 1.4.0 there was no endpoint at
 * all, and the only alternative would have been a hardcoded UUID attaching a
 * Partner to an area nobody chose.
 */

export function AreasStep() {
  const { draft, update, isReadOnly } = useApplicationEditor();

  const reference = useApplicationReference();

  if (reference.isPending) {
    return (
      <p className="flex items-center gap-2 py-6 text-text-secondary">
        <Spinner size="sm" />
        Loading areas…
      </p>
    );
  }

  if (reference.isError) {
    return (
      <ErrorState
        title="We could not load the areas"
        message="Nothing you have chosen is lost. Check your connection and try again."
        actionLabel="Try again"
        onAction={reference.refetch}
      />
    );
  }

  if (reference.serviceAreas.length === 0) {
    return (
      <p
        role="status"
        className="rounded-card border border-line bg-surface p-4 text-sm text-text-secondary"
      >
        No areas are open for new Partners at the moment. We will let you know as
        soon as one near you opens.
      </p>
    );
  }

  return (
    <fieldset className="border-0 p-0">
      <legend className="text-base font-semibold text-text">
        Which areas will you travel to?
      </legend>
      <p className="mt-1 text-sm text-text-secondary">
        You will only be offered jobs inside the areas you pick. Choose as many
        as you are genuinely willing to reach.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {reference.serviceAreas.map((area) => (
          <SelectableRow
            key={area.id}
            checked={draft.serviceAreaIds.includes(area.id)}
            disabled={isReadOnly}
            onChange={() =>
              update({ serviceAreaIds: toggle(draft.serviceAreaIds, area.id) })
            }
            label={area.name}
            caption={area.timezone}
          />
        ))}
      </div>
    </fieldset>
  );
}
