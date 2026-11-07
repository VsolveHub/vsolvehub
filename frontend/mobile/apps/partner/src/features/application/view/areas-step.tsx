// Ported from frontend/apps/partner/features/application/view/areas-step.tsx
import { ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { Platform, Pressable, useWindowDimensions, View } from "react-native";

import { toggle } from "../model/draft";
import { useApplicationReference } from "../reference-queries";
import { useApplicationEditor, useProceedDisabled } from "./application-editor";
import { SelectableRow } from "./selectable-row";

export function AreasStep() {
  const { draft, update, isReadOnly } = useApplicationEditor();
  const reference = useApplicationReference();
  useProceedDisabled(draft.serviceAreaIds.length === 0);
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  if (reference.isPending) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8, paddingVertical: 32 }}>
        <Spinner size="sm" />
        <Text style={{ fontSize: 14, color: "#64748b" }}>Loading service areas…</Text>
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
      <Text
        accessibilityLiveRegion="polite"
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#e2e8f0",
          backgroundColor: "#ffffff",
          padding: 16,
          fontSize: 14,
          color: "#64748b",
        }}
      >
        No service areas are currently available for registration.
      </Text>
    );
  }

  const allAreaIds = reference.serviceAreas.map((area) => area.id);
  const allSelected = allAreaIds.length > 0 && allAreaIds.every((id) => draft.serviceAreaIds.includes(id));
  const selectedCount = draft.serviceAreaIds.length;

  return (
    <View style={{ flexDirection: "column", rowGap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: "#00112e" }}>
          Service Locations <Text style={{ color: "#be123c" }}>*</Text>
        </Text>

        {!isReadOnly && reference.serviceAreas.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (allSelected) update({ serviceAreaIds: [] });
              else update({ serviceAreaIds: allAreaIds });
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#00204d" }}>
              {allSelected ? "Deselect all" : "Select all"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View
        style={{
          flexDirection: isDesktop ? "row" : "column",
          flexWrap: isDesktop ? "wrap" : "nowrap",
          gap: 12,
        }}
      >
        {reference.serviceAreas.map((area) => (
          <View key={area.id} style={{ width: isDesktop ? "48.5%" : "100%" }}>
            <SelectableRow
              checked={draft.serviceAreaIds.includes(area.id)}
              disabled={isReadOnly}
              onChange={() => update({ serviceAreaIds: toggle(draft.serviceAreaIds, area.id) })}
              label={area.name}
            />
          </View>
        ))}
      </View>

      {selectedCount === 0 ? (
        <Text style={{ marginTop: 4, fontSize: 13, fontWeight: "600", color: "#be123c" }}>
          * Please select at least one service location.
        </Text>
      ) : null}
      <Text style={{ marginTop: 8, fontSize: 13, lineHeight: 18, color: "#64748b" }}>
        {"Can't find your area? We are adding more. Ask us from Help and we will tell you when it opens."}
      </Text>
    </View>
  );
}
