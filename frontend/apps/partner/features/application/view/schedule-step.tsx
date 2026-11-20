"use client";

import { ApiRequestError } from "@vsolve/api-client";
import {
  collapseToWeeklySet,
  expandExceptions,
  expandWeeklySet,
} from "@vsolve/query";
import { ErrorState, Spinner, useT } from "@vsolve/ui";
import { useEffect, useMemo, useRef } from "react";

import { toRuleInputs, type DraftPeriod } from "../model/schedule";
import {
  usePartnerApplication,
  usePartnerAvailability,
  useUpdateAvailability,
} from "../queries";
import { useApplicationReference } from "../reference-queries";
import { previousStep } from "../model/progress";
import { nextStep } from "../model/steps";
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

  const { shifts, differed } = useMemo(() => {
    const activeRules = (availability.data?.rules ?? [])
      .filter((r) => r.is_active)
      .map((r) => ({
        serviceAreaId: r.service_area_id,
        weekday: r.weekday,
        startsAt: r.starts_at.slice(0, 5),
        endsAt: r.ends_at.slice(0, 5),
        endsNextDay: r.ends_next_day,
      }));
    return collapseToWeeklySet(activeRules);
  }, [availability.data?.rules]);

  const initialPeriods = useMemo<DraftPeriod[]>(() => {
    const primaryAreaId = areas[0]?.id ?? "";
    return shifts.map((shift, idx) => ({
      key: `period-${shift.weekday}-${idx}`,
      serviceAreaId: primaryAreaId,
      weekday: shift.weekday,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      endsNextDay: shift.endsNextDay,
    }));
  }, [shifts, areas]);

  // An area was added in Step 3 after hours were already set: give it the same weekly set, so
  // submit does not stop on "hours for each area" for a partner who already did the work.
  const autoCopied = useRef(false);
  const savedRules = availability.data?.rules;
  const savedExceptions = availability.data?.exceptions;
  const mutateAvailability = save.mutate;
  useEffect(() => {
    if (autoCopied.current || availability.isPending || !savedRules || areas.length === 0) return;
    const activeRules = savedRules.filter((r) => r.is_active);
    const covered = new Set(activeRules.map((r) => r.service_area_id));
    const missing = areas.some((a) => !covered.has(a.id));
    if (!missing || shifts.length === 0) return;
    autoCopied.current = true;
    const areaIds = areas.map((a) => a.id);
    const primaryAreaId = areas[0]?.id ?? "";
    const periods: DraftPeriod[] = shifts.map((shift, idx) => ({
      key: `auto-${shift.weekday}-${idx}`,
      serviceAreaId: primaryAreaId,
      weekday: shift.weekday,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      endsNextDay: shift.endsNextDay,
    }));
    mutateAvailability({
      rules: toRuleInputs(expandWeeklySet(periods, areaIds)),
      exceptions: expandExceptions(
        (savedExceptions ?? []).map((exception) => ({
          serviceAreaId: exception.service_area_id,
          date: exception.date,
          isAvailable: exception.is_available,
          startsAt: exception.starts_at,
          endsAt: exception.ends_at,
          endsNextDay: exception.ends_next_day,
          reason: exception.reason,
        })),
        areaIds,
      ).map((e) => ({
        service_area_id: e.serviceAreaId,
        date: e.date,
        is_available: e.isAvailable ?? true,
        starts_at: e.startsAt ?? null,
        ends_at: e.endsAt ?? null,
        ends_next_day: e.endsNextDay ?? false,
        reason: e.reason ?? null,
      })),
    });
  }, [areas, availability.isPending, savedRules, savedExceptions, shifts, mutateAvailability]);

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
      backHref={previousStep("/apply/schedule", application.data?.track)?.href ?? "/apply"}
      nextHref={nextStep("/apply/schedule", application.data?.track)?.href ?? "/apply/review"}
      areas={areas}
      differed={differed}
      initialPeriods={initialPeriods}
      isSaving={save.isPending}
      saveError={
        save.isError
          ? save.error instanceof ApiRequestError
            ? t("apply.schedule.saveFailed.contract")
            : t("apply.schedule.saveFailed.generic")
          : null
      }
      onSave={async (periods) => {
        const areaIds = areas.map((a) => a.id);
        const expandedRules = expandWeeklySet(periods, areaIds);
        const rawExceptions = (availability.data?.exceptions ?? []).map((exception) => ({
          serviceAreaId: exception.service_area_id,
          date: exception.date,
          isAvailable: exception.is_available,
          startsAt: exception.starts_at,
          endsAt: exception.ends_at,
          endsNextDay: exception.ends_next_day,
          reason: exception.reason,
        }));
        const expandedExceptions = expandExceptions(rawExceptions, areaIds).map((e) => ({
          service_area_id: e.serviceAreaId,
          date: e.date,
          is_available: e.isAvailable ?? true,
          starts_at: e.startsAt ?? null,
          ends_at: e.endsAt ?? null,
          ends_next_day: e.endsNextDay ?? false,
          reason: e.reason ?? null,
        }));
        await save.mutateAsync({
          rules: toRuleInputs(expandedRules),
          exceptions: expandedExceptions,
        });
      }}
    />
  );
}
