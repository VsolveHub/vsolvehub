"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { ErrorState, Spinner, useT } from "@vsolve/ui";
import { useMemo } from "react";

import { toDraft, toRuleInputs, type DraftPeriod } from "../model/schedule";
import {
  usePartnerApplication,
  usePartnerAvailability,
  useUpdateAvailability,
} from "../queries";
import { useApplicationReference } from "../reference-queries";
import { AvailabilityEditor, type ServiceAreaOption } from "./availability-editor";

/**
 * The hours the applicant is willing to work.
 *
 * Availability is per service area, so the options are the areas on the
 * Partner's own application, labelled from `GET /api/v1/service-areas/`. The
 * label used to be the raw id because nothing published area names; guessing one
 * would have let a Partner publish hours against the wrong area.
 *
 * The editor refuses to render with no areas, which is correct: hours for an
 * area you do not work in are hours nobody can use.
 */

/**
 * The page's own header, as a client component.
 *
 * `/apply/schedule`'s page is a Server Component (so it keeps its `metadata`
 * export), and `useT` needs the client `I18nProvider`. Rendering this small
 * translated header from the page, alongside `ScheduleStep`, keeps the page
 * serialisable without pushing `"use client"` onto it.
 */
export function ScheduleHeader() {
  const t = useT();
  return (
    <header className="flex flex-col gap-1 border-b border-line pb-4">
      <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-navy-900">
        {t("apply.schedule.pageTitle")}
      </h1>
      <p className="text-xs sm:text-sm leading-relaxed text-text-secondary">
        {t("apply.schedule.pageDescription")}
      </p>
    </header>
  );
}

export function ScheduleStep() {
  const t = useT();
  const application = usePartnerApplication();
  const availability = usePartnerAvailability();
  const save = useUpdateAvailability();

  const reference = useApplicationReference();

  const areas = useMemo<ServiceAreaOption[]>(() => {
    const names = new Map(reference.serviceAreas.map((area) => [area.id, area.name]));
    return (application.data?.service_area_ids ?? []).map((id) => ({
      id,
      // Falls back to the id rather than inventing a name: an area the applicant
      // holds that is no longer published still has to be identifiable.
      label: names.get(id) ?? t("apply.schedule.areaFallback", { id: id.slice(0, 8) }),
    }));
  }, [application.data?.service_area_ids, reference.serviceAreas, t]);

  const initialPeriods = useMemo<DraftPeriod[]>(
    () => toDraft(availability.data?.rules ?? []),
    [availability.data?.rules],
  );

  if (availability.isPending || application.isPending || reference.isPending) {
    return (
      <p className="flex items-center gap-2 py-8 text-text-secondary">
        <Spinner size="sm" />
        {t("apply.schedule.loading")}
      </p>
    );
  }

  if (availability.isError) {
    return (
      <ErrorState
        title={t("apply.schedule.loadError.title")}
        message={t("apply.schedule.loadError.message")}
        actionLabel={t("common.tryAgain")}
        onAction={() => void availability.refetch()}
      />
    );
  }

  return (
    <AvailabilityEditor
      // Re-seeds the editor from the server after every successful save, so a
      // rule Django normalised is shown as Django stored it.
      key={availability.dataUpdatedAt}
      areas={areas}
      initialPeriods={initialPeriods}
      isSaving={save.isPending}
      saveError={
        save.isError
          ? save.error instanceof ApiRequestError
            ? t("apply.schedule.saveFailed.contract")
            : t("apply.schedule.saveFailed.generic")
          : null
      }
      onSave={(periods) =>
        save.mutate({
          rules: toRuleInputs(periods),
          // Dated exceptions are edited elsewhere; sending the ones already on
          // file keeps a whole-schedule PUT from deleting them.
          exceptions: (availability.data?.exceptions ?? []).map((exception) => ({
            service_area_id: exception.service_area_id,
            date: exception.date,
            is_available: exception.is_available,
            starts_at: exception.starts_at,
            ends_at: exception.ends_at,
            ends_next_day: exception.ends_next_day,
            reason: exception.reason,
          })),
        })
      }
    />
  );
}
