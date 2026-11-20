// Ported from frontend/apps/partner/features/application/view/areas-step.tsx
// Step 3 "Where you work" (docs/onboarding-step3-flow/FLOW.md): tick open areas, or type a PIN.
import {
  canContinueStep3,
  isValidPin,
  matchPin,
  MAX_REQUESTED_PINS,
  normalisePin,
} from "@vsolve/query/native";
import { Badge, ErrorState, Spinner, Text, useT } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Platform, Pressable, TextInput, useWindowDimensions, View } from "react-native";

import { toggle } from "../model/draft";
import { useApplicationReference } from "../reference-queries";
import { useApplicationEditor, useProceedDisabled } from "./application-editor";
import { SelectableRow } from "./selectable-row";

export function AreasStep() {
  const t = useT();
  const { draft, update, application, isReadOnly } = useApplicationEditor();
  const reference = useApplicationReference();
  const [inputPin, setInputPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [matchedNotice, setMatchedNotice] = useState<string | null>(null);
  const [isExpandOpen, setIsExpandOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  const canContinue = canContinueStep3(draft.serviceAreaIds, draft.requestedPostalCodes);
  useProceedDisabled(!canContinue);

  if (reference.isPending) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8, paddingVertical: 32 }}>
        <Spinner size="sm" />
        <Text style={{ fontSize: 14, color: "#64748b" }}>{t("apply.areas.loading")}</Text>
      </View>
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

  const requestedPins = draft.requestedPostalCodes;
  const areaRequests = application?.area_requests ?? [];

  function handleAddPin() {
    const pin = normalisePin(inputPin);
    setMatchedNotice(null);
    if (!isValidPin(pin)) {
      setPinError(t("apply.areas.pinInvalid"));
      return;
    }
    setPinError(null);

    // Case B: the PIN is in one or more open areas. Tick every one of them.
    const result = matchPin(reference.serviceAreas, pin);
    if (result.kind === "open" && result.areas.length > 0) {
      const toTick = result.areas
        .map((area) => area.id)
        .filter((id) => !draft.serviceAreaIds.includes(id));
      if (toTick.length > 0) update({ serviceAreaIds: [...draft.serviceAreaIds, ...toTick] });
      setMatchedNotice(
        t("apply.areas.pinMatchedNotice", {
          pin,
          area: result.areas.map((area) => area.name).join(", "),
        }),
      );
      setInputPin("");
      return;
    }

    // Cases C and D: no open area covers it. Noted; the server says which of the two it is.
    if (requestedPins.includes(pin)) {
      setPinError(t("apply.areas.pinAlreadyAdded"));
      return;
    }
    if (requestedPins.length >= MAX_REQUESTED_PINS) {
      setPinError(t("apply.areas.pinMaxReached"));
      return;
    }
    update({ requestedPostalCodes: [...requestedPins, pin] });
    setInputPin("");
  }

  function handleRemovePin(pin: string) {
    update({ requestedPostalCodes: requestedPins.filter((candidate) => candidate !== pin) });
  }

  // Case H: an asked PIN now has an open area. Tick it, and the request is done.
  function handleTickReadyArea(pin: string, areaId: string) {
    update({
      serviceAreaIds: draft.serviceAreaIds.includes(areaId)
        ? draft.serviceAreaIds
        : [...draft.serviceAreaIds, areaId],
      requestedPostalCodes: requestedPins.filter((candidate) => candidate !== pin),
    });
  }

  const pinInput = (
    <View style={{ flexDirection: "column", rowGap: 8 }}>
      <Text style={{ fontSize: 12, color: "#64748b" }}>{t("apply.areas.notListedHint")}</Text>
      <View style={{ flexDirection: "row", columnGap: 8, alignItems: "center" }}>
        <TextInput
          accessibilityLabel={t("apply.areas.pinPlaceholder")}
          keyboardType="number-pad"
          maxLength={6}
          value={inputPin}
          editable={!isReadOnly}
          onChangeText={(value) => {
            setInputPin(value);
            setPinError(null);
          }}
          onSubmitEditing={handleAddPin}
          placeholder={t("apply.areas.pinPlaceholder")}
          placeholderTextColor="#94a3b8"
          style={{
            width: 160,
            minHeight: 44,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#e2e8f0",
            backgroundColor: "#ffffff",
            paddingHorizontal: 12,
            fontSize: 14,
            color: "#00112e",
          }}
        />
        <Pressable
          accessibilityRole="button"
          disabled={isReadOnly || inputPin.trim().length === 0}
          onPress={handleAddPin}
          style={{
            minHeight: 44,
            justifyContent: "center",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#cbd5e1",
            paddingHorizontal: 16,
            opacity: isReadOnly || inputPin.trim().length === 0 ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#00204d" }}>
            {t("apply.areas.addPin")}
          </Text>
        </Pressable>
      </View>
      {pinError ? (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, fontWeight: "600", color: "#be123c" }}>
          {pinError}
        </Text>
      ) : null}
    </View>
  );

  const pinChips =
    requestedPins.length > 0 ? (
      <View style={{ flexDirection: "column", rowGap: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748b" }}>
          {`${t("apply.statusBanner.requestedPinsTitle")} (${requestedPins.length}/${MAX_REQUESTED_PINS})`}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {requestedPins.map((pin) => {
            const request = areaRequests.find((candidate) => candidate.postal_code === pin);
            return (
              <View
                key={pin}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  columnGap: 8,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                  backgroundColor: "#f8fafc",
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#00112e" }}>{pin}</Text>
                {request?.status === "READY" && request.covering_area_id ? (
                  <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
                    <Badge tone="success">
                      {t("apply.areas.pinReady", { area: request.covering_area_name ?? "" })}
                    </Badge>
                    {!isReadOnly ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => handleTickReadyArea(pin, request.covering_area_id!)}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#00204d", textDecorationLine: "underline" }}>
                          {t("apply.areas.pinTickIt")}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : request?.status === "AREA_FULL" ? (
                  <Badge tone="warning">{t("apply.areas.pinAreaFull")}</Badge>
                ) : request?.status === "WAITING" ? (
                  <Badge tone="neutral">{t("apply.areas.pinWaiting")}</Badge>
                ) : (
                  <Text style={{ fontSize: 11, color: "#94a3b8" }}>
                    {t("apply.areas.pinNotedNotice", { pin })}
                  </Text>
                )}
                {!isReadOnly ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("apply.areas.removePin", { pin })}
                    hitSlop={8}
                    onPress={() => handleRemovePin(pin)}
                  >
                    <Text style={{ fontSize: 16, color: "#94a3b8" }}>×</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
    ) : null;

  // Case F: no open areas at all. The PIN box takes the list's place.
  if (reference.serviceAreas.length === 0) {
    return (
      <View style={{ flexDirection: "column", rowGap: 16 }}>
        <Text
          accessibilityLiveRegion="polite"
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#bfdbfe",
            backgroundColor: "#eff6ff",
            padding: 16,
            fontSize: 14,
            color: "#1e3a8a",
          }}
        >
          {t("apply.areas.zeroAreasNotice")}
        </Text>
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#e2e8f0",
            backgroundColor: "#ffffff",
            padding: 16,
            rowGap: 12,
          }}
        >
          {pinInput}
        </View>
        {pinChips}
      </View>
    );
  }

  const allAreaIds = reference.serviceAreas.map((area) => area.id);
  const allSelected = allAreaIds.length > 0 && allAreaIds.every((id) => draft.serviceAreaIds.includes(id));

  return (
    <View style={{ flexDirection: "column", rowGap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: "#00112e" }}>
          {t("apply.areas.legend")} <Text style={{ color: "#be123c" }}>*</Text>
        </Text>

        {!isReadOnly && reference.serviceAreas.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => update({ serviceAreaIds: allSelected ? [] : allAreaIds })}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#00204d" }}>
              {allSelected ? t("apply.areas.deselectAll") : t("apply.areas.selectAll")}
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

      {matchedNotice ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#bbf7d0",
            backgroundColor: "#f0fdf4",
            padding: 12,
            fontSize: 12,
            fontWeight: "600",
            color: "#166534",
          }}
        >
          {matchedNotice}
        </Text>
      ) : null}

      {/* "My area is not listed": always shown, so a partner is never stuck. */}
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "#e2e8f0",
          backgroundColor: "#ffffff",
          padding: 16,
          rowGap: 12,
        }}
      >
        {!isExpandOpen ? (
          <Pressable
            accessibilityRole="button"
            disabled={isReadOnly}
            onPress={() => setIsExpandOpen(true)}
            style={{ alignSelf: "flex-start", minHeight: 44, justifyContent: "center" }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#00204d" }}>
              {`+ ${t("apply.areas.notListedButton")}`}
            </Text>
          </Pressable>
        ) : (
          <View style={{ rowGap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#00112e" }}>
                {t("apply.areas.notListedButton")}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setIsExpandOpen(false);
                  setPinError(null);
                }}
              >
                <Text style={{ fontSize: 12, color: "#64748b" }}>{t("common.cancel")}</Text>
              </Pressable>
            </View>
            {pinInput}
          </View>
        )}
        {pinChips}
      </View>

      {!canContinue ? (
        <Text style={{ marginTop: 4, fontSize: 13, fontWeight: "600", color: "#be123c" }}>
          {t("apply.areas.selectOrRequest")}
        </Text>
      ) : null}
    </View>
  );
}
