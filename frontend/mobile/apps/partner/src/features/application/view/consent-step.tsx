// Ported from frontend/apps/partner/features/application/view/consent-step.tsx
import { ErrorState, Spinner } from "@vsolve/mobile-ui";
import { Check, FileText, X } from "lucide-react-native";
import { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useApplicationReference, type RequiredConsent } from "../reference-queries";
import { useApplicationEditor, useProceedDisabled } from "./application-editor";

export function ConsentStep() {
  const { draft, update, isReadOnly } = useApplicationEditor();
  const reference = useApplicationReference();
  const [selectedDoc, setSelectedDoc] = useState<RequiredConsent | null>(null);

  const isAccepted = (purpose: string, version: string) =>
    draft.consents.some(
      (consent) => consent.purpose === purpose && consent.documentVersion === version,
    );

  const requiredConsents = (reference.requiredConsents ?? []).filter(
    (consent) => consent.is_required_for_submission,
  );
  const allRequiredAccepted =
    requiredConsents.length > 0 &&
    requiredConsents.every((consent) => isAccepted(consent.purpose, consent.document_version));

  // Disable proceed until all required agreements are accepted (unconditional hook call)
  useProceedDisabled(!allRequiredAccepted || reference.isPending);

  if (reference.isPending) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="sm" />
        <Text style={styles.loadingText}>Loading agreements…</Text>
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

  const handleToggle = (purpose: string, version: string) => {
    if (isReadOnly) return;
    const accepted = isAccepted(purpose, version);
    update({
      consents: accepted
        ? draft.consents.filter(
            (c) => !(c.purpose === purpose && c.documentVersion === version),
          )
        : [...draft.consents, { purpose, documentVersion: version }],
    });
  };

  return (
    <View style={styles.container}>
      {/* Title & Subtitle */}
      <View style={styles.header}>
        <Text style={styles.title}>Agreements</Text>
        <Text style={styles.subtitle}>Please review and accept the following documents to continue.</Text>
      </View>

      {/* Cards List */}
      <View style={styles.cardsContainer}>
        {reference.requiredConsents.map((doc) => {
          const accepted = isAccepted(doc.purpose, doc.document_version);
          return (
            <View key={`${doc.purpose}@${doc.document_version}`} style={styles.card}>
              <View style={styles.cardLeft}>
                {/* Square Checkbox */}
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: accepted, disabled: isReadOnly }}
                  disabled={isReadOnly}
                  onPress={() => handleToggle(doc.purpose, doc.document_version)}
                  style={({ pressed }) => [
                    styles.checkbox,
                    accepted ? styles.checkboxChecked : styles.checkboxUnchecked,
                    pressed && !accepted ? { borderColor: "#ea580c" } : null,
                  ]}
                >
                  {accepted ? <Check size={14} color="#ffffff" strokeWidth={3} /> : null}
                </Pressable>

                {/* Details */}
                <View style={styles.cardContent}>
                  <Text style={styles.docTitle}>{doc.title}</Text>
                  <View style={styles.docMetaRow}>
                    <Text style={styles.docVersion}>v{doc.document_version} • </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setSelectedDoc(doc)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.readLink}>Read</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* Right Document Icon */}
              <Pressable
                accessibilityRole="button"
                onPress={() => setSelectedDoc(doc)}
                style={styles.iconButton}
              >
                <FileText size={22} color="#00112e" />
              </Pressable>
            </View>
          );
        })}
      </View>

      {/* Document Reader Modal */}
      <Modal
        visible={selectedDoc !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedDoc(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{selectedDoc?.title}</Text>
                <Text style={styles.modalVersion}>Version {selectedDoc?.document_version}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSelectedDoc(null)}
                style={styles.closeButton}
              >
                <X size={20} color="#00112e" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={true}>
              <Text style={styles.docBodyText}>
                By accepting this agreement, you acknowledge that you have read and agreed to comply with VSolve Hub's partner terms, service quality standards, and platform policies.
                {"\n\n"}
                Document URL: {selectedDoc?.document_url || "https://vsolvehub.com/terms"}
              </Text>
            </ScrollView>

            <View style={styles.modalFooter}>
              {selectedDoc && !isAccepted(selectedDoc.purpose, selectedDoc.document_version) ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    handleToggle(selectedDoc.purpose, selectedDoc.document_version);
                    setSelectedDoc(null);
                  }}
                  style={styles.modalAcceptButton}
                >
                  <Text style={styles.modalAcceptText}>Accept Agreement</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSelectedDoc(null)}
                  style={styles.modalCloseButton}
                >
                  <Text style={styles.modalCloseText}>Close</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "column",
    width: "100%",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 14,
    color: "#64748b",
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#00112e",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
    lineHeight: 20,
  },
  cardsContainer: {
    flexDirection: "column",
    rowGap: 12,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 1px 4px rgba(0, 0, 0, 0.05)",
        } as any)
      : {
          elevation: 2,
          shadowColor: "#00112e",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
        }),
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 14,
    flex: 1,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxUnchecked: {
    borderColor: "#94a3b8",
    backgroundColor: "#ffffff",
  },
  checkboxChecked: {
    borderColor: "#f26a0f",
    backgroundColor: "#f26a0f",
  },
  cardContent: {
    flexDirection: "column",
    flex: 1,
  },
  docTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#00112e",
  },
  docMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  docVersion: {
    fontSize: 13,
    color: "#64748b",
  },
  readLink: {
    fontSize: 13,
    color: "#2563eb",
    fontWeight: "600",
  },
  iconButton: {
    padding: 4,
    marginLeft: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    padding: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
    paddingBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#00112e",
  },
  modalVersion: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  closeButton: {
    padding: 8,
    borderRadius: 9999,
    backgroundColor: "#f1f5f9",
  },
  modalBody: {
    paddingVertical: 16,
    maxHeight: 380,
  },
  docBodyText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#334155",
  },
  modalFooter: {
    borderTopWidth: 1,
    borderColor: "#e2e8f0",
    paddingTop: 16,
  },
  modalAcceptButton: {
    backgroundColor: "#ea580c",
    borderRadius: 9999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalAcceptText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  modalCloseButton: {
    backgroundColor: "#f1f5f9",
    borderRadius: 9999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: {
    color: "#00112e",
    fontSize: 15,
    fontWeight: "700",
  },
});
