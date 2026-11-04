import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Headphones,
  Lock,
  MessageCircle,
  Phone,
  RefreshCw,
  Send,
  X,
  XCircle,
} from "lucide-react-native";
import { useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { StatusTimeline, type TimelineNode } from "@/features/onboarding/components/status-timeline";
import {
  extractRejectionReason,
  extractTimelineDates,
  formatSpecTimestamp,
  resolveStatusView,
  type ApplicationStatusView,
} from "../model/status-view";
import { usePartnerApplication } from "../queries";
import {
  PARTNER_SUPPORT_EMAIL,
  PARTNER_SUPPORT_PHONE,
  PARTNER_SUPPORT_PHONE_DISPLAY,
  openSupportCall,
  openSupportEmail,
  openSupportWhatsApp,
} from "@/features/support/contact";

export interface ApplicationStatusScreenProps {
  forcedStatus?: ApplicationStatusView | "SUBMITTED" | "CHANGES_REQUIRED" | "APPROVED" | "DECLINED" | "REJECTED";
  forcedReason?: string;
  forcedCanAppeal?: boolean;
}

export function ApplicationStatusScreen({
  forcedStatus,
  forcedReason,
  forcedCanAppeal,
}: ApplicationStatusScreenProps) {
  const router = useRouter();
  const params = useLocalSearchParams<{
    status?: string;
    reason?: string;
    appeal?: string;
  }>();

  const query = usePartnerApplication();
  const application = query.data ?? null;

  // Modals state
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [appealModalOpen, setAppealModalOpen] = useState(false);
  const [appealSubmitted, setAppealSubmitted] = useState(false);

  // 1. Determine effective view mode
  const rawParamStatus = params.status?.toLowerCase();
  const normalizedForced = forcedStatus
    ? (forcedStatus === "SUBMITTED"
        ? "in_review"
        : forcedStatus === "CHANGES_REQUIRED"
        ? "changes_needed"
        : forcedStatus === "APPROVED"
        ? "approved"
        : forcedStatus === "DECLINED" || forcedStatus === "REJECTED"
        ? "rejected"
        : forcedStatus)
    : null;

  const paramStatus: ApplicationStatusView | null =
    rawParamStatus === "rejected" || rawParamStatus === "declined"
      ? "rejected"
      : rawParamStatus === "changes_needed" || rawParamStatus === "changes_required"
      ? "changes_needed"
      : rawParamStatus === "approved"
      ? "approved"
      : rawParamStatus === "in_review" || rawParamStatus === "submitted"
      ? "in_review"
      : null;

  const effectiveView: ApplicationStatusView =
    normalizedForced || paramStatus || resolveStatusView(application, application?.documents);

  // 2. Extract Rejection Reason
  let effectiveReason = "";
  if (params.reason !== undefined) {
    effectiveReason = params.reason === "none" ? "" : params.reason;
  } else if (forcedReason !== undefined) {
    effectiveReason = forcedReason;
  } else {
    effectiveReason = extractRejectionReason(application) || "Documents could not be verified.";
  }

  // 3. Appeal capability
  const canAppeal =
    forcedCanAppeal !== undefined
      ? forcedCanAppeal
      : params.appeal === "false"
      ? false
      : true;

  // 4. Timestamps
  const timelineDates = extractTimelineDates(application);
  const submittedAtFormatted = formatSpecTimestamp(
    timelineDates.submittedAt,
    "26 Oct 2026, 6:39 pm",
  );
  const inReviewAtFormatted = formatSpecTimestamp(
    timelineDates.inReviewAt,
    "26 Oct 2026, 6:41 pm",
  );
  const decidedAtFormatted = formatSpecTimestamp(
    timelineDates.decidedAt,
    "27 Oct 2026, 10:20 am",
  );

  // 5. Build Timeline Nodes
  const getTimelineNodes = (): TimelineNode[] => {
    switch (effectiveView) {
      case "in_review":
        return [
          {
            title: "Submitted",
            subtitle: submittedAtFormatted,
            state: "completed",
            connectorColors: "#2fa84f",
          },
          {
            title: "In review",
            subtitle: "We're checking your details.",
            state: "active-blue",
            connectorColors: "#e2e8f0",
          },
          {
            title: "Decision",
            subtitle: "Approval or changes request.",
            state: "pending",
          },
        ];

      case "changes_needed":
        return [
          {
            title: "Submitted",
            subtitle: submittedAtFormatted,
            state: "completed",
            connectorColors: "#2fa84f",
          },
          {
            title: "Changes requested",
            subtitle: inReviewAtFormatted,
            state: "active-orange",
            connectorColors: "#e2e8f0",
          },
          {
            title: "Decision",
            subtitle: "Approval after updates.",
            state: "pending",
          },
        ];

      case "approved":
        return [
          {
            title: "Submitted",
            subtitle: submittedAtFormatted,
            state: "completed",
            connectorColors: "#2fa84f",
          },
          {
            title: "In review",
            subtitle: inReviewAtFormatted,
            state: "completed",
            connectorColors: "#2fa84f",
          },
          {
            title: "Decision",
            subtitle: `Approved on ${decidedAtFormatted}.`,
            state: "completed",
          },
        ];

      case "rejected":
        return [
          {
            title: "Submitted",
            subtitle: submittedAtFormatted,
            state: "completed",
            connectorColors: "#2fa84f",
          },
          {
            title: "In review",
            subtitle: inReviewAtFormatted,
            state: "completed",
            // Connector turns green->red near the Decision node
            connectorColors: ["#2fa84f", "#ef4444"],
          },
          {
            title: "Decision",
            subtitle: `Not approved on ${decidedAtFormatted}.`,
            state: "rejected",
          },
        ];
    }
  };

  const handleOpenPartnerApp = async () => {
    try {
      const supported = await Linking.canOpenURL("vsolvepartner://");
      if (supported) {
        await Linking.openURL("vsolvepartner://");
      } else {
        router.push("/(app)/(tabs)/home" as any);
      }
    } catch {
      router.push("/(app)/(tabs)/home" as any);
    }
  };

  const handleSendAppeal = () => {
    setAppealSubmitted(true);
    setAppealModalOpen(false);
    openSupportWhatsApp(
      `Appeal Request for Partner Application ${application?.id || "webaura"}.\nReason: I would like to request an appeal review for my unapproved application.`,
    );
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={styles.scrollContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* ========================================================================= */}
      {/* 1. SCREEN 7: IN REVIEW                                                    */}
      {/* ========================================================================= */}
      {effectiveView === "in_review" ? (
        <View style={styles.contentGroup}>
          <View style={styles.blueBanner}>
            <View style={styles.blueIconCircle}>
              <Clock size={28} color="#1d4ed8" strokeWidth={2.4} />
            </View>
            <View style={styles.bannerInfo}>
              <Text style={styles.bannerTitle}>Application in review</Text>
              <Text style={styles.bannerSubtitle}>
                We usually respond within{"\n"}24-48 hours.
              </Text>
            </View>
          </View>

          <StatusTimeline nodes={getTimelineNodes()} />

          <View style={styles.nextStepCard}>
            <View style={styles.lockedStrip}>
              <Lock size={16} color="#475569" strokeWidth={2.2} />
              <Text style={styles.lockedText}>Editing is locked while we review.</Text>
            </View>

            <View style={styles.nextStepBlock}>
              <Text style={styles.nextStepCaption}>Next step</Text>
              <Text style={styles.nextStepTitle}>Wait for our decision.</Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* ========================================================================= */}
      {/* 2. SCREEN 8: CHANGES NEEDED                                               */}
      {/* ========================================================================= */}
      {effectiveView === "changes_needed" ? (
        <View style={styles.contentGroup}>
          <View style={styles.orangeBanner}>
            <View style={styles.orangeIconCircle}>
              <AlertTriangle size={26} color="#f87000" strokeWidth={2.3} />
            </View>
            <View style={styles.bannerInfo}>
              <Text style={styles.bannerTitle}>1 document needs fixing</Text>
              <Text style={styles.bannerSubtitle}>
                Please update the document below to continue.
              </Text>
            </View>
          </View>

          <StatusTimeline nodes={getTimelineNodes()} />

          <View style={styles.reuploadCard}>
            <View style={styles.reuploadCardHeader}>
              <View style={styles.reuploadIconBox}>
                <FileText size={22} color="#f87000" strokeWidth={2} />
              </View>
              <View style={styles.reuploadInfo}>
                <Text style={styles.reuploadTitle}>Proof of address</Text>
                <Text style={styles.reuploadWarning}>Expired document</Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Re-upload proof of address"
              onPress={() => router.push("/apply/documents" as any)}
              style={({ pressed }) => [
                styles.primaryOrangeButton,
                pressed ? { opacity: 0.85 } : null,
              ]}
            >
              <RefreshCw size={16} color="#ffffff" strokeWidth={2.2} style={{ marginRight: 8 }} />
              <Text style={styles.primaryOrangeButtonText}>Re-upload</Text>
            </Pressable>
          </View>

          <View style={styles.nextStepCard}>
            <View style={styles.nextStepBlock}>
              <Text style={styles.nextStepCaption}>Next step</Text>
              <Text style={styles.nextStepTitle}>Re-upload the document.</Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* ========================================================================= */}
      {/* 3. SCREEN 9: APPROVED                                                     */}
      {/* ========================================================================= */}
      {effectiveView === "approved" ? (
        <View style={styles.contentGroup}>
          <View style={styles.greenBanner}>
            <View style={styles.greenIconCircle}>
              <CheckCircle2 size={26} color="#16a34a" strokeWidth={2.3} />
            </View>
            <View style={styles.bannerInfo}>
              <Text style={styles.bannerTitle}>You're approved!</Text>
              <Text style={styles.bannerSubtitle}>
                Open the V Solve Partner app to start receiving jobs.
              </Text>
            </View>
          </View>

          <StatusTimeline nodes={getTimelineNodes()} />

          <View style={styles.nextStepCard}>
            <View style={styles.nextStepBlock}>
              <Text style={styles.nextStepCaption}>Next step</Text>
              <Text style={styles.nextStepTitle}>Open the V Solve Partner app.</Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open partner app"
                onPress={handleOpenPartnerApp}
                style={({ pressed }) => [
                  styles.primaryOrangeButton,
                  { marginTop: 14 },
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <ExternalLink size={18} color="#ffffff" strokeWidth={2.2} style={{ marginRight: 8 }} />
                <Text style={styles.primaryOrangeButtonText}>Open partner app</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {/* ========================================================================= */}
      {/* 4. SCREEN 10: NOT APPROVED (REJECTED) — Spec-Perfect Implementation       */}
      {/* ========================================================================= */}
      {effectiveView === "rejected" ? (
        <View style={styles.contentGroup}>
          {/* Banner: Pale red tint, soft red border, radius ~20-24, solid 52px red circle with white X */}
          <View
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            style={styles.redBanner}
          >
            <View style={styles.redIconCircle}>
              <X size={26} color="#ffffff" strokeWidth={2.8} />
            </View>
            <View style={styles.bannerInfo}>
              <Text style={styles.bannerTitle}>Application not approved</Text>
              {effectiveReason.trim().length > 0 ? (
                <Text style={styles.bannerSubtitle}>
                  Reason: {effectiveReason}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Timeline Card with green->red gradient connector */}
          <StatusTimeline nodes={getTimelineNodes()} />

          {/* Actions below Timeline: Full-width Solid Orange Contact Support & Outline Appeal */}
          <View style={styles.rejectedActionStack}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Contact support"
              onPress={() => setSupportModalOpen(true)}
              style={({ pressed }) => [
                styles.primaryOrangeButton,
                pressed ? { opacity: 0.9 } : null,
              ]}
            >
              <MessageCircle size={19} color="#ffffff" strokeWidth={2.2} style={{ marginRight: 8 }} />
              <Text style={styles.primaryOrangeButtonText}>Contact support</Text>
            </Pressable>

            {canAppeal ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Appeal"
                onPress={() => setAppealModalOpen(true)}
                style={({ pressed }) => [
                  styles.outlineAppealButton,
                  pressed ? { backgroundColor: "#f8fafc" } : null,
                ]}
              >
                <Text style={styles.outlineAppealButtonText}>Appeal</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* ========================================================================= */}
      {/* Sticky Spec Footer: Hairline separator + Headset icon + "Need help?"       */}
      {/* ========================================================================= */}
      <View style={styles.footerHairlineWrapper}>
        <View style={styles.footerHairline} />
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Need help?"
          onPress={() => setSupportModalOpen(true)}
          style={({ pressed }) => [
            styles.footerHelpButton,
            pressed ? { opacity: 0.7 } : null,
          ]}
        >
          <Headphones size={17} color="#00112e" strokeWidth={2.2} style={{ marginRight: 7 }} />
          <Text style={styles.footerHelpText}>Need help?</Text>
        </Pressable>
      </View>

      {/* ========================================================================= */}
      {/* Support Sheet Modal                                                       */}
      {/* ========================================================================= */}
      <Modal
        visible={supportModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSupportModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSupportModalOpen(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderTitleBox}>
                <Headphones size={22} color="#ea580c" />
                <Text style={styles.modalTitle}>Partner Help & Support</Text>
              </View>
              <Pressable onPress={() => setSupportModalOpen(false)} hitSlop={12}>
                <X size={20} color="#64748b" />
              </Pressable>
            </View>

            <Text style={styles.modalBodyText}>
              Our partner onboarding desk is available {PARTNER_SUPPORT_PHONE_DISPLAY} to answer questions or assist with your application.
            </Text>

            <View style={styles.modalActionStack}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSupportModalOpen(false);
                  openSupportWhatsApp("Hi VsolveHub Partner Support, I need assistance with my application.");
                }}
                style={styles.modalOptionButton}
              >
                <MessageCircle size={18} color="#059669" />
                <Text style={styles.modalOptionText}>Chat on WhatsApp</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSupportModalOpen(false);
                  openSupportCall();
                }}
                style={styles.modalOptionButton}
              >
                <Phone size={18} color="#2563eb" />
                <Text style={styles.modalOptionText}>Call Support ({PARTNER_SUPPORT_PHONE_DISPLAY})</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSupportModalOpen(false);
                  openSupportEmail("Partner Application Assistance");
                }}
                style={styles.modalOptionButton}
              >
                <Send size={18} color="#475569" />
                <Text style={styles.modalOptionText}>Email {PARTNER_SUPPORT_EMAIL}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* Appeal Sheet Modal                                                        */}
      {/* ========================================================================= */}
      <Modal
        visible={appealModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAppealModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAppealModalOpen(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderTitleBox}>
                <Text style={styles.modalTitle}>Submit an Appeal</Text>
              </View>
              <Pressable onPress={() => setAppealModalOpen(false)} hitSlop={12}>
                <X size={20} color="#64748b" />
              </Pressable>
            </View>

            <Text style={styles.modalBodyText}>
              If you believe there was an error in reviewing your documents or profile, you can submit an appeal request directly to our Senior Partner Review Desk.
            </Text>

            <View style={styles.modalActionStack}>
              <Pressable
                accessibilityRole="button"
                onPress={handleSendAppeal}
                style={[styles.primaryOrangeButton, { width: "100%" }]}
              >
                <Text style={styles.primaryOrangeButtonText}>Continue with Appeal</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => setAppealModalOpen(false)}
                style={[styles.outlineAppealButton, { width: "100%", height: 44 }]}
              >
                <Text style={styles.outlineAppealButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
    width: "100%",
  },
  contentGroup: {
    flexDirection: "column",
    rowGap: 16,
  },
  blueBanner: {
    backgroundColor: "#eff6ff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#dbeafe",
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 16,
    boxShadow: "0 2px 8px rgba(7, 19, 40, 0.03)",
  },
  blueIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },
  orangeBanner: {
    backgroundColor: "#fff7ed",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#fed7aa",
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 16,
  },
  orangeIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#ffedd5",
    alignItems: "center",
    justifyContent: "center",
  },
  greenBanner: {
    backgroundColor: "#ecfdf5",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 16,
  },
  greenIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#d1fae5",
    alignItems: "center",
    justifyContent: "center",
  },
  redBanner: {
    backgroundColor: "#fef2f2",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 16,
    boxShadow: "0 2px 8px rgba(220, 38, 38, 0.04)",
  },
  redIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerInfo: {
    flex: 1,
    flexDirection: "column",
  },
  bannerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#071328",
    letterSpacing: -0.4,
  },
  bannerSubtitle: {
    fontSize: 14,
    color: "#475569",
    marginTop: 6,
    lineHeight: 20,
    fontWeight: "400",
  },
  nextStepCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: 20,
    flexDirection: "column",
    boxShadow: "0 2px 8px rgba(7, 19, 40, 0.04)",
  },
  lockedStrip: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 10,
    backgroundColor: "#f1f5f9",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  lockedText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  nextStepBlock: {
    flexDirection: "column",
  },
  nextStepCaption: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 4,
  },
  nextStepTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#071328",
    letterSpacing: -0.2,
  },
  reuploadCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#fed7aa",
    padding: 18,
    flexDirection: "column",
    boxShadow: "0 2px 8px rgba(248, 112, 0, 0.05)",
  },
  reuploadCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 14,
    marginBottom: 16,
  },
  reuploadIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fff7ed",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ffedd5",
  },
  reuploadInfo: {
    flex: 1,
    flexDirection: "column",
  },
  reuploadTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#071328",
  },
  reuploadWarning: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ea580c",
    marginTop: 2,
  },
  primaryOrangeButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: "#f87000",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    boxShadow: "0 4px 12px rgba(248, 112, 0, 0.2)",
  },
  primaryOrangeButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  rejectedActionStack: {
    flexDirection: "column",
    rowGap: 14,
    marginTop: 4,
  },
  outlineAppealButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  outlineAppealButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#071328",
  },
  footerHairlineWrapper: {
    marginTop: 28,
    paddingTop: 14,
    flexDirection: "column",
  },
  footerHairline: {
    height: 1,
    backgroundColor: "#e2e8f0",
    width: "100%",
    marginBottom: 14,
  },
  footerHelpButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  footerHelpText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#00112e",
    textDecorationLine: "underline",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 17, 46, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    padding: 24,
    flexDirection: "column",
    boxShadow: "0 16px 36px rgba(0, 17, 46, 0.16)",
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalHeaderTitleBox: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#071328",
  },
  modalBodyText: {
    fontSize: 13.5,
    color: "#64748b",
    lineHeight: 20,
    marginBottom: 20,
  },
  modalActionStack: {
    flexDirection: "column",
    rowGap: 10,
  },
  modalOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  modalOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#071328",
  },
});
