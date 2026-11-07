// Ported from frontend/apps/partner/features/application/view/schedule-step.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useMemo } from "react";
import { View } from "react-native";

import { toDraft, toRuleInputs, type DraftPeriod } from "../model/schedule";
import { usePartnerApplication, usePartnerAvailability, useUpdateAvailability } from "../queries";
import { useApplicationReference } from "../reference-queries";
import { AvailabilityEditor, type ServiceAreaOption } from "./availability-editor";

export function ScheduleStep() {
  const application = usePartnerApplication();
  const availability = usePartnerAvailability();
  const save = useUpdateAvailability();
  const reference = useApplicationReference();

  const areas = useMemo<ServiceAreaOption[]>(() => {
    const names = new Map(reference.serviceAreas.map((area) => [area.id, area.name]));
    return (application.data?.service_area_ids ?? []).map((id) => ({
      id,
      label: names.get(id) ?? `Service area ${id.slice(0, 8)}`,
    }));
  }, [application.data?.service_area_ids, reference.serviceAreas]);

  const initialPeriods = useMemo<DraftPeriod[]>(
    () => toDraft(availability.data?.rules ?? []),
    [availability.data?.rules],
  );

  if (availability.isPending || application.isPending || reference.isPending) {
    return (
      <View className="flex-row items-center gap-2 py-8">
        <Spinner size="sm" />
        <Text className="text-text-secondary">Loading your hours…</Text>
      </View>
    );
  }

  if (availability.isError) {
    return (
      <ErrorState
        title="We could not load your hours"
        message="Nothing you have published has changed. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void availability.refetch()}
      />
    );
  }

  return (
    <AvailabilityEditor
      key={availability.dataUpdatedAt}
      areas={areas}
      initialPeriods={initialPeriods}
      isSaving={save.isPending}
      saveError={
        save.isError
          ? save.error instanceof ApiRequestError
            ? "Your hours were not saved. Check the periods below and try again."
            : "Your hours were not saved. Check your connection and try again."
          : null
      }
      onSave={(periods) =>
        save.mutate({
          rules: toRuleInputs(periods),
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
