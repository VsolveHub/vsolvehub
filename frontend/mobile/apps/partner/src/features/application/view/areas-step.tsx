// Ported from frontend/apps/partner/features/application/view/areas-step.tsx
import { ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { Pressable, View } from "react-native";

import { toggle } from "../model/draft";
import { useApplicationReference } from "../reference-queries";
import { useApplicationEditor } from "./application-editor";
import { SelectableRow } from "./selectable-row";

export function AreasStep() {
  const { draft, update, isReadOnly } = useApplicationEditor();
  const reference = useApplicationReference();

  if (reference.isPending) {
    return (
      <View className="flex-row items-center gap-2 py-8">
        <Spinner size="sm" />
        <Text className="text-sm text-text-secondary">Loading service areas…</Text>
      </View>
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
      <Text accessibilityLiveRegion="polite" className="rounded-control border border-line bg-surface p-4 text-sm text-text-secondary">
        No service areas are currently available for registration.
      </Text>
    );
  }

  const allAreaIds = reference.serviceAreas.map((area) => area.id);
  const allSelected = allAreaIds.length > 0 && allAreaIds.every((id) => draft.serviceAreaIds.includes(id));
  const selectedCount = draft.serviceAreaIds.length;

  return (
    <View className="flex-col gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold text-navy-900">
          Service Locations <Text className="text-danger-text">*</Text>
        </Text>

        {!isReadOnly && reference.serviceAreas.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (allSelected) update({ serviceAreaIds: [] });
              else update({ serviceAreaIds: allAreaIds });
            }}
          >
            <Text className="text-xs font-semibold text-navy-700">{allSelected ? "Deselect all" : "Select all"}</Text>
          </Pressable>
        ) : null}
      </View>

      <View className="flex-col gap-3">
        {reference.serviceAreas.map((area) => (
          <SelectableRow
            key={area.id}
            checked={draft.serviceAreaIds.includes(area.id)}
            disabled={isReadOnly}
            onChange={() => update({ serviceAreaIds: toggle(draft.serviceAreaIds, area.id) })}
            label={area.name}
            caption={area.timezone || undefined}
          />
        ))}
      </View>

      {selectedCount === 0 ? (
        <Text className="mt-1 text-xs font-semibold text-danger-text">
          * Please select at least one service location.
        </Text>
      ) : null}
    </View>
  );
}
