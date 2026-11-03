import { useRouter } from "expo-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Headphones,
  Lock,
  MessageSquare,
  RefreshCw,
  XCircle,
} from "lucide-react-native";
import { useState } from "react";
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandHeader } from "@/features/onboarding/components/brand-header";
import { ProfileMenuSheet } from "@/features/onboarding/components/profile-menu-sheet";
import { StatusTimeline, type TimelineNode } from "@/features/onboarding/components/status-timeline";
import { usePartnerApplication } from "../queries";

export type StatusViewMode = "SUBMITTED" | "CHANGES_REQUIRED" | "APPROVED" | "REJECTED";

export interface ApplicationStatusScreenProps {
  forcedStatus?: StatusViewMode;
}

export function ApplicationStatusScreen({ forcedStatus }: ApplicationStatusScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const query = usePartnerApplication();
  const application = query.data ?? null;

  // Determine effective status: forcedStatus > query status > default to SUBMITTED
  const currentAppStatus = (application?.status as string) || "SUBMITTED";
  const effectiveStatus: StatusViewMode =
    forcedStatus ||
    (currentAppStatus === "APPROVED"
      ? "APPROVED"
      : currentAppStatus === "CHANGES_REQUIRED"
      ? "CHANGES_REQUIRED"
      : currentAppStatus === "REJECTED"
      ? "REJECTED"
      : "SUBMITTED"); // covers SUBMITTED and UNDER_REVIEW

  const [previewStatus, setPreviewStatus] = useState<StatusViewMode>(effectiveStatus);

  const bottomInset = Math.max(insets.bottom, Platform.OS === "ios" ? 34 : 16);
  const initialLetter = (application?.display_name || "webaura").trim()[0]?.toUpperCase() || "W";

  // Timeline nodes based on status
  const getTimelineNodes = (status: StatusViewMode): TimelineNode[] => {
    switch (status) {
      case "SUBMITTED":
        return [
          {
            title: "Submitted",
            subtitle: "26 Oct 2026, 6:39 pm",
            state: "completed",
          },
          {
            title: "In review",
            subtitle: "We're checking your details.",
            state: "active-blue",
          },
          {
            title: "Decision",
            subtitle: "Approval or changes request.",
            state: "pending",
          },
        ];
      case "CHANGES_REQUIRED":
        return [
          {
            title: "Submitted",
            subtitle: "26 Oct 2026, 6:39 pm",
            state: "completed",
          },
          {
            title: "Changes requested",
            subtitle: "26 Oct 2026, 6:41 pm",
            state: "active-orange",
          },
          {
            title: "Decision",
            subtitle: "Approval after updates.",
            state: "pending",
          },
        ];
      case "APPROVED":
        return [
          {
            title: "Submitted",
            subtitle: "26 Oct 2026, 6:39 pm",
            state: "completed",
          },
          {
            title: "In review",
            subtitle: "26 Oct 2026, 6:41 pm",
            state: "completed",
          },
          {
            title: "Decision",
            subtitle: "Approved on 27 Oct 2026, 10:20 am.",
            state: "completed",
          },
        ];
      case "REJECTED":
        return [
          {
            title: "Submitted",
            subtitle: "26 Oct 2026, 6:39 pm",
            state: "completed",
          },
          {
            title: "In review",
            subtitle: "26 Oct 2026, 6:41 pm",
            state: "completed",
          },
          {
            title: "Decision",
            subtitle: "Not aproved on 27 Oct 2026, 10:20 am.",
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

  const isRejected = previewStatus === "REJECTED";

  return (
    <View style={styles.root}>
      {/* Top Brand Header */}
      <BrandHeader
        showBack
        backVariant={isRejected ? "arrow" : "chevron"}
        onBack={() => router.back()}
        onAvatarPress={() => setProfileModalOpen(true)}
        partnerInitial={initialLetter}
      />

      {/* Dev preview switcher bar if running in development */}
      {__DEV__ ? (
        <View style={styles.devBar}>
          {(["SUBMITTED", "CHANGES_REQUIRED", "APPROVED", "REJECTED"] as StatusViewMode[]).map((s) => (
            <Pressable
              key={s}
              onPress={() => setPreviewStatus(s)}
              style={[styles.devBadge, previewStatus === s ? styles.devBadgeActive : null]}
            >
              <Text
                style={[
                  styles.devBadgeText,
                  previewStatus === s ? styles.devBadgeTextActive : null,
                ]}
              >
                {s === "SUBMITTED"
                  ? "7. In Review"
                  : s === "CHANGES_REQUIRED"
                  ? "8. Changes"
                  : s === "APPROVED"
                  ? "9. Approved"
                  : "10. Rejected"}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            maxWidth: isDesktop ? 672 : "100%",
            paddingBottom: bottomInset + 80,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Screen 7: In review */}
        {previewStatus === "SUBMITTED" ? (
          <View style={styles.contentGroup}>
            {/* Status Banner */}
            <View style={styles.blueBanner}>
              <View style={styles.blueIconCircle}>
                <Clock size={24} color="#2563eb" strokeWidth={2.2} />
              </View>
              <View style={styles.bannerInfo}>
                <Text style={styles.bannerTitle}>Application in review</Text>
                <Text style={styles.bannerSubtitle}>We usually respond within 24–48 hours.</Text>
              </View>
            </View>

            {/* Timeline */}
            <StatusTimeline nodes={getTimelineNodes("SUBMITTED")} />

            {/* Editing is locked strip */}
            <View style={styles.lockedStrip}>
              <Lock size={18} color="#2563eb" strokeWidth={2} />
              <Text style={styles.lockedText}>Editing is locked while we review.</Text>
            </View>

            {/* Next step section */}
            <View style={styles.nextStepBlock}>
              <Text style={styles.nextStepCaption}>Next step</Text>
              <Text style={styles.nextStepTitle}>Wait for our decision.</Text>
            </View>
          </View>
        ) : null}

        {/* Screen 8: Changes needed */}
        {previewStatus === "CHANGES_REQUIRED" ? (
          <View style={styles.contentGroup}>
            {/* Warning Banner */}
            <View style={styles.orangeBanner}>
              <View style={styles.orangeIconCircle}>
                <AlertTriangle size={24} color="#f26a0f" strokeWidth={2.2} />
              </View>
              <View style={styles.bannerInfo}>
                <Text style={styles.bannerTitle}>1 document needs fixing</Text>
                <Text style={styles.bannerSubtitle}>
                  Please update the document below to continue.
                </Text>
              </View>
            </View>

            {/* Timeline */}
            <StatusTimeline nodes={getTimelineNodes("CHANGES_REQUIRED")} />

            {/* Re-upload document card */}
            <View style={styles.reuploadCard}>
              <View style={styles.reuploadCardHeader}>
                <View style={styles.reuploadIconBox}>
                  <FileText size={22} color="#f26a0f" strokeWidth={2} />
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
                  styles.reuploadButton,
                  pressed ? { opacity: 0.85 } : null,
                ]}
              >
                <RefreshCw size={16} color="#ffffff" strokeWidth={2.2} style={{ marginRight: 8 }} />
                <Text style={styles.reuploadButtonText}>Re-upload</Text>
              </Pressable>
            </View>

            {/* Next step section */}
            <View style={styles.nextStepBlock}>
              <Text style={styles.nextStepCaption}>Next step</Text>
              <Text style={styles.nextStepTitle}>Re-upload the document.</Text>
            </View>
          </View>
        ) : null}

        {/* Screen 9: Approved */}
        {previewStatus === "APPROVED" ? (
          <View style={styles.contentGroup}>
            {/* Approved Banner */}
            <View style={styles.greenBanner}>
              <View style={styles.greenIconCircle}>
                <CheckCircle2 size={24} color="#16a34a" strokeWidth={2.2} />
              </View>
              <View style={styles.bannerInfo}>
                <Text style={styles.bannerTitle}>You're approved!</Text>
                <Text style={styles.bannerSubtitle}>
                  Open the V Solve Partner app to start receiving jobs.
                </Text>
              </View>
            </View>

            {/* Timeline */}
            <StatusTimeline nodes={getTimelineNodes("APPROVED")} />

            {/* Next step section */}
            <View style={styles.nextStepBlock}>
              <Text style={styles.nextStepCaption}>Next step</Text>
              <Text style={styles.nextStepTitle}>Open the V Solve Partner app.</Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open partner app"
                onPress={handleOpenPartnerApp}
                style={({ pressed }) => [
                  styles.primaryOrangeButton,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <ExternalLink size={18} color="#ffffff" strokeWidth={2.2} style={{ marginRight: 8 }} />
                <Text style={styles.primaryOrangeButtonText}>Open partner app</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Screen 10: Not approved */}
        {previewStatus === "REJECTED" ? (
          <View style={styles.contentGroup}>
            {/* Rejected Banner */}
            <View style={styles.redBanner}>
              <View style={styles.redIconCircle}>
                <XCircle size={26} color="#dc2626" strokeWidth={2.2} />
              </View>
              <View style={styles.bannerInfo}>
                <Text style={styles.bannerTitle}>Application not approved</Text>
                <Text style={styles.bannerSubtitle}>
                  Reason: Documents could not be verified.
                </Text>
              </View>
            </View>

            {/* Timeline */}
            <StatusTimeline nodes={getTimelineNodes("REJECTED")} />

            {/* Action Buttons */}
            <View style={styles.rejectedActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Contact support"
                onPress={() => void Linking.openURL("https://wa.me/918008765832")}
                style={({ pressed }) => [
                  styles.primaryOrangeButton,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <MessageSquare size={18} color="#ffffff" strokeWidth={2} style={{ marginRight: 8 }} />
                <Text style={styles.primaryOrangeButtonText}>Contact support</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Appeal"
                onPress={() => void Linking.openURL("mailto:support@vsolvehub.com?subject=Partner%20Application%20Appeal")}
                style={({ pressed }) => [
                  styles.outlineButton,
                  pressed ? { backgroundColor: "#f8fafc" } : null,
                ]}
              >
                <Text style={styles.outlineButtonText}>Appeal</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky Bottom Help Row */}
      <View style={[styles.bottomHelpBar, { paddingBottom: bottomInset + 12 }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/help" as any)}
          style={({ pressed }) => [styles.helpButton, pressed ? { opacity: 0.7 } : null]}
        >
          {isRejected ? (
            <Headphones size={16} color="#00112e" strokeWidth={2.2} style={{ marginRight: 6 }} />
          ) : null}
          <Text style={styles.helpButtonText}>Need help?</Text>
        </Pressable>
      </View>

      {/* Screen 11: Profile Menu Bottom Sheet */}
      <ProfileMenuSheet
        visible={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        partnerName={application?.display_name || "webaura"}
        partnerPhone="+91 98765 43210"
        partnerInitial={initialLetter}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fbfaf8",
  },
  devBar: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: "space-around",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  devBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  devBadgeActive: {
    backgroundColor: "#00112e",
  },
  devBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
  },
  devBadgeTextActive: {
    color: "#ffffff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    width: "100%",
    alignSelf: "center",
  },
  contentGroup: {
    flexDirection: "column",
    rowGap: 16,
  },
  blueBanner: {
    backgroundColor: "#eff6ff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#dbeafe",
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 14,
  },
  blueIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },
  orangeBanner: {
    backgroundColor: "#fff7ed",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#fed7aa",
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 14,
  },
  orangeIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ffedd5",
    alignItems: "center",
    justifyContent: "center",
  },
  greenBanner: {
    backgroundColor: "#ecfdf5",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 14,
  },
  greenIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#d1fae5",
    alignItems: "center",
    justifyContent: "center",
  },
  redBanner: {
    backgroundColor: "#fef2f2",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 14,
  },
  redIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerInfo: {
    flex: 1,
    flexDirection: "column",
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#00112e",
    letterSpacing: -0.3,
  },
  bannerSubtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
    lineHeight: 18,
  },
  lockedStrip: {
    backgroundColor: "#eff6ff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dbeafe",
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 10,
  },
  lockedText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e40af",
  },
  nextStepBlock: {
    paddingHorizontal: 4,
    marginTop: 4,
  },
  nextStepCaption: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748b",
  },
  nextStepTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#00112e",
    marginTop: 2,
  },
  reuploadCard: {
    backgroundColor: "#fef2f2",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 18,
    flexDirection: "column",
    rowGap: 14,
  },
  reuploadCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 12,
  },
  reuploadIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#ffedd5",
    alignItems: "center",
    justifyContent: "center",
  },
  reuploadInfo: {
    flex: 1,
    flexDirection: "column",
  },
  reuploadTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#00112e",
  },
  reuploadWarning: {
    fontSize: 13,
    fontWeight: "600",
    color: "#dc2626",
    marginTop: 2,
  },
  reuploadButton: {
    backgroundColor: "#f26a0f",
    borderRadius: 12,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  reuploadButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  primaryOrangeButton: {
    backgroundColor: "#f26a0f",
    borderRadius: 14,
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  primaryOrangeButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  outlineButton: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  outlineButtonText: {
    color: "#00112e",
    fontSize: 15,
    fontWeight: "700",
  },
  rejectedActions: {
    flexDirection: "column",
    marginTop: 4,
  },
  bottomHelpBar: {
    position: Platform.OS === "web" ? ("fixed" as any) : "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  helpButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  helpButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#00112e",
    textDecorationLine: "underline",
  },
});
