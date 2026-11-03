// Ported from frontend/apps/partner/features/application/view/consent-step.tsx
import { ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { Check } from "lucide-react-native";
import { Linking, Platform, Pressable, View } from "react-native";

import { useApplicationReference } from "../reference-queries";
import { useApplicationEditor } from "./application-editor";

export function ConsentStep() {
  const { draft, update, isReadOnly } = useApplicationEditor();
  const reference = useApplicationReference();

  if (reference.isPending) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8, paddingVertical: 32 }}>
        <Spinner size="sm" />
        <Text style={{ fontSize: 14, color: "#64748b" }}>Loading agreements…</Text>
      </View>
    );
  }

  if (reference.isError) {
    return (
      <ErrorState
        title="Could not load agreements"
        message="Check your connection and try again."
        actionLabel="Try again"
        onAction={reference.refetch}
      />
    );
  }

  if (reference.requiredConsents.length === 0) {
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
        No agreements are required at this time.
      </Text>
    );
  }

  const isAccepted = (purpose: string, version: string) =>
    draft.consents.some((consent) => consent.purpose === purpose && consent.documentVersion === version);

  const requiredConsents = reference.requiredConsents.filter((consent) => consent.is_required_for_submission);
  const allRequiredAccepted =
    requiredConsents.length > 0 &&
    requiredConsents.every((consent) => isAccepted(consent.purpose, consent.document_version));

  return (
    <View style={{ flexDirection: "column", rowGap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: "#00112e" }}>
          Required Agreements <Text style={{ color: "#be123c" }}>*</Text>
        </Text>

        {!isReadOnly && requiredConsents.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (allRequiredAccepted) {
                const requiredKeys = new Set(
                  requiredConsents.map((consent) => `${consent.purpose}@${consent.document_version}`),
                );
                update({
                  consents: draft.consents.filter(
                    (consent) => !requiredKeys.has(`${consent.purpose}@${consent.documentVersion}`),
                  ),
                });
              } else {
                const existing = [...draft.consents];
                for (const doc of requiredConsents) {
                  if (!isAccepted(doc.purpose, doc.document_version)) {
                    existing.push({
                      purpose: doc.purpose,
                      documentVersion: doc.document_version,
                    });
                  }
                }
                update({ consents: existing });
              }
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#00204d" }}>
              {allRequiredAccepted ? "Deselect all" : "Accept all required"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: "column", rowGap: 12 }}>
        {reference.requiredConsents.map((document) => {
          const accepted = isAccepted(document.purpose, document.document_version);
          return (
            <Pressable
              key={`${document.purpose}@${document.document_version}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: accepted, disabled: isReadOnly }}
              disabled={isReadOnly}
              onPress={() => {
                if (isReadOnly) return;
                update({
                  consents: accepted
                    ? draft.consents.filter(
                        (consent) =>
                          !(
                            consent.purpose === document.purpose &&
                            consent.documentVersion === document.document_version
                          ),
                      )
                    : [
                        ...draft.consents,
                        {
                          purpose: document.purpose,
                          documentVersion: document.document_version,
                        },
                      ],
                });
              }}
              style={({ pressed }) => ({
                borderRadius: 14,
                borderWidth: 1,
                borderColor: accepted ? "#ff6a00" : pressed ? "#cbd5e1" : "#e2e8f0",
                backgroundColor: accepted ? "#fffbf5" : "#ffffff",
                padding: 16,
                flexDirection: "row",
                alignItems: "flex-start",
                columnGap: 12,
              })}
            >
              {/* Checkbox Square */}
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  borderWidth: 1.5,
                  borderColor: accepted ? "#ff6a00" : "#94a3b8",
                  backgroundColor: accepted ? "#ff6a00" : "#ffffff",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 2,
                }}
              >
                {accepted ? <Check size={12} color="#ffffff" strokeWidth={3} /> : null}
              </View>

              {/* Document Details */}
              <View style={{ flex: 1, minWidth: 0 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 6,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#00112e", flex: 1, minWidth: 180 }}>
                    I agree to the {document.title}
                  </Text>
                  {document.is_required_for_submission ? (
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#be123c" }}>
                      * Required
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 12, color: "#64748b" }}>
                      Optional
                    </Text>
                  )}
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 10,
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#64748b" }}>
                    Version {document.document_version}
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Read ${document.title}`}
                    onPress={(e) => {
                      e.stopPropagation();
                      if (document.document_url) {
                        if (Platform.OS === "web") {
                          window.open(document.document_url, "_blank", "noopener,noreferrer");
                        } else {
                          void Linking.openURL(document.document_url);
                        }
                      }
                    }}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      columnGap: 4,
                      borderRadius: 9999,
                      borderWidth: 1,
                      borderColor: "#e2e8f0",
                      backgroundColor: pressed ? "#f1f5f9" : "#ffffff",
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                    })}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#00112e" }}>
                      Read document ↗
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
