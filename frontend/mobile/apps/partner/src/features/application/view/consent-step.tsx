// Ported from frontend/apps/partner/features/application/view/consent-step.tsx
import { ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import * as WebBrowser from "expo-web-browser";
import { Pressable, View } from "react-native";

import { useApplicationReference } from "../reference-queries";
import { useApplicationEditor } from "./application-editor";

export function ConsentStep() {
  const { draft, update, isReadOnly } = useApplicationEditor();
  const reference = useApplicationReference();

  if (reference.isPending) {
    return (
      <View className="flex-row items-center gap-2 py-6">
        <Spinner size="sm" />
        <Text className="text-sm text-text-secondary">Loading agreements…</Text>
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
      <Text accessibilityLiveRegion="polite" className="rounded-control border border-line bg-surface p-4 text-sm text-text-secondary">
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
    <View className="flex-col gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold text-navy-900">
          Required Agreements <Text className="text-danger-text">*</Text>
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
            <Text className="text-xs font-semibold text-navy-700">
              {allRequiredAccepted ? "Deselect all" : "Accept all required"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View className="flex-col gap-3">
        {reference.requiredConsents.map((document) => {
          const accepted = isAccepted(document.purpose, document.document_version);
          return (
            <View
              key={`${document.purpose}@${document.document_version}`}
              className={
                accepted
                  ? "rounded-control border border-action bg-selected-surface p-3.5"
                  : "rounded-control border border-line bg-surface p-3.5"
              }
            >
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: accepted, disabled: isReadOnly }}
                disabled={isReadOnly}
                onPress={() =>
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
                  })
                }
                className="flex-row items-start gap-3"
              >
                <View
                  className={
                    accepted
                      ? "mt-0.5 h-4 w-4 items-center justify-center rounded border border-action bg-action"
                      : "mt-0.5 h-4 w-4 rounded border border-line-strong bg-surface"
                  }
                >
                  {accepted ? <Text className="text-[10px] font-bold text-action-text">✓</Text> : null}
                </View>
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 text-sm font-medium text-text">I agree to the {document.title}</Text>
                    {document.is_required_for_submission ? (
                      <Text className="text-xs font-semibold text-danger-text">* Required</Text>
                    ) : (
                      <Text className="text-xs text-text-muted">Optional</Text>
                    )}
                  </View>
                  <View className="mt-2 flex-row items-center justify-between">
                    <Text className="text-xs text-text-secondary">Version {document.document_version}</Text>
                    <Pressable
                      accessibilityRole="link"
                      onPress={() => void WebBrowser.openBrowserAsync(document.document_url)}
                      className="flex-row items-center gap-1 rounded-full border border-line bg-surface px-3 py-1"
                    >
                      <Text className="text-xs font-bold text-navy-900">Read document</Text>
                      <Text className="text-xs font-bold text-navy-900">↗</Text>
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
