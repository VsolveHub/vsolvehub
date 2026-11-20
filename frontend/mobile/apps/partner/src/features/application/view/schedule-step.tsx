// Ported from frontend/apps/partner/features/application/view/schedule-step.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { ErrorState, Spinner, Text, useT } from "@vsolve/mobile-ui";
import { collapseToWeeklySet, expandExceptions, expandWeeklySet } from "@vsolve/query/native";
import { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";

import { nextStep } from "../model/steps";
import { previousStep } from "../model/progress";
import { toRuleInputs, type DraftPeriod } from "../model/schedule";
import { usePartnerApplication, usePartnerAvailability, useUpdateAvailability } from "../queries";
import { useApplicationReference } from "../reference-queries";
import { AvailabilityEditor, type ServiceAreaOption } from "./availability-editor";

type SavedException = {
  service_area_id: string;
  date: string;
  is_available: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  ends_next_day?: boolean;
  reason?: string | null;
};

/** The saved dated exceptions, copied to every area exactly as the weekly set is. */
function exceptionsForAreas(saved: readonly SavedException[], areaIds: readonly string[]) {
  return expandExceptions(
    saved.map((exception) => ({
      serviceAreaId: exception.service_area_id,
      date: exception.date,
      isAvailable: exception.is_available,
      startsAt: exception.starts_at ?? null,
      endsAt: exception.ends_at ?? null,
      endsNextDay: exception.ends_next_day ?? false,
      reason: exception.reason ?? null,
    })),
    areaIds,
  ).map((e) => ({
    service_area_id: e.serviceAreaId,
    date: e.date,
    is_available: e.isAvailable ?? true,
    starts_at: e.startsAt ?? null,
    ends_at: e.endsAt ?? null,
    ends_next_day: e.endsNextDay ?? false,
    reason: e.reason ?? undefined,
  }));
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
      label: names.get(id) ?? t("apply.schedule.areaFallback", { id: id.slice(0, 8) }),
    }));
  }, [application.data?.service_area_ids, reference.serviceAreas, t]);

  const track = application.data?.track;
  const following = nextStep("/apply/schedule", track);
  const preceding = previousStep("/apply/schedule", track);

  // One weekly set for every area (FLOW.md, Hours). An older draft with different hours per area
  // shows the busiest area's hours, with a note that saving uses them for all.
  const { shifts, differed } = useMemo(
    () =>
      collapseToWeeklySet(
        (availability.data?.rules ?? [])
          .filter((rule) => rule.is_active)
          .map((rule) => ({
            serviceAreaId: rule.service_area_id,
            weekday: rule.weekday,
            startsAt: rule.starts_at.slice(0, 5),
            endsAt: rule.ends_at.slice(0, 5),
            endsNextDay: rule.ends_next_day,
          })),
      ),
    [availability.data?.rules],
  );

  const initialPeriods = useMemo<DraftPeriod[]>(() => {
    const primaryAreaId = areas[0]?.id ?? "";
    return shifts.map((shift, index) => ({
      key: `period-${shift.weekday}-${index}`,
      serviceAreaId: primaryAreaId,
      weekday: shift.weekday,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      endsNextDay: shift.endsNextDay,
    }));
  }, [shifts, areas]);

  // An area was added in Step 3 after hours were set: give it the same weekly set, so submit
  // does not stop on "hours for each area" for a partner who already did the work.
  const autoCopied = useRef(false);
  const savedRules = availability.data?.rules;
  const savedExceptions = availability.data?.exceptions;
  const mutateAvailability = save.mutate;
  useEffect(() => {
    if (autoCopied.current || availability.isPending || !savedRules || areas.length === 0) return;
    const covered = new Set(
      savedRules.filter((rule) => rule.is_active).map((rule) => rule.service_area_id),
    );
    if (!areas.some((area) => !covered.has(area.id)) || initialPeriods.length === 0) return;
    autoCopied.current = true;
    const areaIds = areas.map((area) => area.id);
    mutateAvailability({
      rules: toRuleInputs(expandWeeklySet(initialPeriods, areaIds)),
      exceptions: exceptionsForAreas(savedExceptions ?? [], areaIds),
    });
  }, [areas, availability.isPending, savedRules, savedExceptions, initialPeriods, mutateAvailability]);

  if (availability.isPending || application.isPending || reference.isPending) {
    return (
      <View className="flex-row items-center gap-2 py-8">
        <Spinner size="sm" />
        <Text className="text-text-secondary">{t("apply.schedule.loading")}</Text>
      </View>
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
      key={availability.dataUpdatedAt}
      areas={areas}
      differed={differed}
      initialPeriods={initialPeriods}
      backHref={preceding?.href ?? "/apply/areas"}
      nextHref={following?.href ?? "/apply/documents"}
      nextStepName={following?.label ?? null}
      isSaving={save.isPending}
      saveError={
        save.isError
          ? save.error instanceof ApiRequestError
            ? t("apply.schedule.saveFailed.contract")
            : t("apply.schedule.saveFailed.generic")
          : null
      }
      onSave={(periods, onSaved) => {
        const areaIds = areas.map((area) => area.id);
        save.mutate(
          {
            rules: toRuleInputs(expandWeeklySet(periods, areaIds)),
            exceptions: exceptionsForAreas(availability.data?.exceptions ?? [], areaIds),
          },
          { onSuccess: () => onSaved?.() },
        );
      }}
    />
  );
}
