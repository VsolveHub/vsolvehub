// Ported from frontend/apps/partner/features/application/view/apply-shell.tsx
import { Text } from "@vsolve/mobile-ui";
import { ApiRequestError } from "@vsolve/api-client";
import { useMobileLogout } from "@vsolve/mobile-core";
import { Slot, usePathname, useRouter } from "expo-router";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Headphones,
  HelpCircle,
  Phone,
  Send,
  X,
} from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApplyDockContext, type DockConfig } from "@/features/application/model/dock-context";
import { previousStep } from "@/features/application/model/progress";
import { APPLICATION_STEPS, nextStep } from "@/features/application/model/steps";
import { usePartnerApplication } from "@/features/application/queries";
import { OnboardingStepper } from "@/features/onboarding/components/onboarding-stepper";
import { ProfileMenuSheet } from "@/features/onboarding/components/profile-menu-sheet";

const logoMark = require("../../../assets/logo-mark.png");

export default function ApplyLayout() {
  const pathname = usePathname();
  const isStatusPage = pathname === "/apply/status" || pathname.endsWith("/status");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const signOut = useMobileLogout("/login?next=%2Fapply");
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const [dockConfig, setDockConfig] = useState<DockConfig | null>(null);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const onCommitRef = useRef<(() => void) | null>(null);

  // Safe area insets with guaranteed fallbacks for native iOS notch / dynamic island
  const topInset = Math.max(
    insets.top,
    Platform.OS === "ios" ? 48 : (StatusBar.currentHeight ?? 24),
  );
  const bottomInset = Math.max(
    insets.bottom,
    Platform.OS === "ios" ? 34 : 16,
  );

  const registerDock = useCallback((config: DockConfig | null) => {
    setDockConfig((prev) => {
      if (prev === null && config === null) return prev;
      if (prev === null || config === null) {
        if (config?.onCommit) onCommitRef.current = config.onCommit;
        return config;
      }
      if (
        prev.label === config.label &&
        prev.backHref === config.backHref &&
        prev.nextStepName === config.nextStepName &&
        prev.isSaving === config.isSaving &&
        prev.proceedDisabled === config.proceedDisabled &&
        prev.saved === config.saved &&
        prev.conflict === config.conflict &&
        prev.refusal?.message === config.refusal?.message &&
        prev.refusal?.title === config.refusal?.title &&
        prev.failed === config.failed &&
        prev.requestId === config.requestId &&
        prev.fieldMessages.join("::") === config.fieldMessages.join("::")
      ) {
        onCommitRef.current = config.onCommit;
        return prev;
      }
      if (config.onCommit) onCommitRef.current = config.onCommit;
      return config;
    });
  }, []);

  const query = usePartnerApplication();
  const missing = query.error instanceof ApiRequestError && query.error.status === 404;
  const application = missing ? null : (query.data ?? null);

  const isSubmitted = application?.status === "SUBMITTED" || application?.status === "UNDER_REVIEW";
  const back = isStatusPage ? { href: "/apply" } : (isSubmitted ? null : previousStep(pathname));
  const shouldShowDock = !isSubmitted && !isStatusPage;

  // Find current step index in the 4-step sequence
  const currentStepIdx = Math.max(
    0,
    APPLICATION_STEPS.findIndex((s) => s.href === pathname || pathname.startsWith(s.href)),
  );
  const currentStep = APPLICATION_STEPS[currentStepIdx] ?? APPLICATION_STEPS[0];

  // User initial (defaults to "W" matching mockup)
  const initialLetter = (application?.display_name || "webaura").trim()[0]?.toUpperCase() || "W";

  // Primary action button configuration with robust fallbacks
  const defaultLabel = currentStepIdx === 3 ? "Submit application" : "Continue";
  const primaryLabel = dockConfig?.label || defaultLabel;
  const isProceedDisabled = dockConfig ? Boolean(dockConfig.proceedDisabled) : false;
  const isSaving = dockConfig ? Boolean(dockConfig.isSaving) : false;

  const handlePrimaryPress = () => {
    if (isProceedDisabled || isSaving) return;
    if (onCommitRef.current) {
      onCommitRef.current();
      return;
    }
    const next = nextStep(pathname);
    if (next) {
      router.push(next.href as any);
    }
  };

  return (
    <ApplyDockContext.Provider value={{ dockConfig, registerDock }}>
      <View style={styles.rootContainer}>
        {/* Top Header with Safe Area Spacing */}
        <View style={[styles.headerContainer, { paddingTop: topInset + 6 }]}>
          <View style={[styles.headerInner, { maxWidth: isDesktop ? 672 : "100%" }]}>
            {/* Left: Back chevron or balanced placeholder */}
            {isStatusPage ? (
              <Pressable cssInterop={false}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={() => {
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.push("/apply" as any);
                  }
                }}
                style={({ pressed }) => [
                  styles.backButton,
                  pressed ? styles.backButtonPressed : null,
                ]}
              >
                <ArrowLeft size={22} color="#00112e" strokeWidth={2.2} />
              </Pressable>
            ) : back !== null && currentStepIdx > 0 ? (
              <Pressable cssInterop={false}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={() => router.push(back.href as any)}
                style={({ pressed }) => [
                  styles.backButton,
                  pressed ? styles.backButtonPressed : null,
                ]}
              >
                <ChevronLeft size={22} color="#00112e" />
              </Pressable>
            ) : (
              <View style={styles.backPlaceholder} />
            )}

            {/* Center: VSolve Hub Logo matching Mockup */}
            <View style={styles.logoCenter}>
              <Image
                source={logoMark}
                style={{ width: 28, height: 28 }}
                resizeMode="contain"
                accessibilityLabel="VSolve Hub"
              />
              <Text style={styles.logoTextNavy}>
                V Solve <Text style={styles.logoTextOrange}>Hub</Text>
              </Text>
            </View>

            {/* Right: Circular User Initial Badge */}
            <Pressable cssInterop={false}
              accessibilityRole="button"
              accessibilityLabel="Partner profile & options"
              onPress={() => setProfileModalOpen(true)}
              style={({ pressed }) => [
                styles.avatarBadge,
                pressed ? styles.avatarBadgePressed : null,
              ]}
            >
              <Text style={styles.avatarText}>{initialLetter}</Text>
            </Pressable>
          </View>

          {/* Stepper: Circles variant for Steps 1-3, Segmented variant for Mixed Documents & Step 4 */}
          <View style={[styles.stepperWrapper, { maxWidth: isDesktop ? 672 : "100%" }]}>
            <OnboardingStepper
              currentStep={currentStepIdx}
              totalSteps={4}
              stepLabel={currentStep.label}
              variant="segmented"
            />
          </View>
        </View>

        {/* Scrollable Main Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              maxWidth: isDesktop ? 672 : "100%",
              paddingBottom: (shouldShowDock || isStatusPage) ? bottomInset + 88 : 40,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Slot />
        </ScrollView>

        {/* Fixed Bottom Action Dock Matching Mockups */}
        {shouldShowDock ? (
          <View style={[styles.dockContainer, { paddingBottom: bottomInset + 12 }]}>
            <View style={[styles.dockInner, { maxWidth: isDesktop ? 672 : "100%" }]}>
              {/* Conflict / Error alerts if any */}
              {dockConfig?.conflict ? (
                <View style={styles.conflictBanner}>
                  <Text style={styles.conflictTitle}>Someone else changed this application</Text>
                  <Text style={styles.conflictSubtitle}>
                    We reloaded the latest version so you can review before continuing.
                  </Text>
                </View>
              ) : null}

              {dockConfig?.refusal ? (
                <View style={styles.failedBanner}>
                  <Text style={styles.failedTitle}>{dockConfig.refusal.title}</Text>
                  <Text style={styles.failedSubtitle}>{dockConfig.refusal.message}</Text>
                </View>
              ) : null}

              {dockConfig?.failed ? (
                <View style={styles.failedBanner}>
                  <Text style={styles.failedTitle}>We could not save this</Text>
                  <Text style={styles.failedSubtitle}>
                    Check your internet connection and try again.
                  </Text>
                </View>
              ) : null}

              {/* Main Dock Row: "Need help?" on left, "Continue ->" on right */}
              <View style={styles.dockActionRow}>
                {/* Left: Need help? */}
                <Pressable cssInterop={false}
                  accessibilityRole="button"
                  onPress={() => setHelpModalOpen(true)}
                  style={({ pressed }) => [
                    styles.helpButton,
                    pressed ? { opacity: 0.7 } : null,
                  ]}
                >
                  
                  <Text style={styles.helpButtonText}>Need help?</Text>
                </Pressable>

                {/* Right: Continue -> (or Submit application) */}
                <Pressable cssInterop={false}
                  accessibilityRole="button"
                  accessibilityLabel={primaryLabel}
                  disabled={isProceedDisabled || isSaving}
                  onPress={handlePrimaryPress}
                  style={({ pressed }) => [
                    styles.continueButton,
                    {
                      backgroundColor: isProceedDisabled
                        ? "#cbd5e1"
                        : pressed
                        ? "#d65e00"
                        : "#f87000",
                      opacity: isProceedDisabled ? 0.95 : 1,
                    },
                  ]}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <View style={styles.continueButtonContent}>
                      <Text style={styles.continueButtonText}>
                        {primaryLabel.includes("Submit application") ? "Submit application" : "Continue"}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {/* Need Help Modal */}
        <Modal
          visible={helpModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setHelpModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.helpModalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                  <HelpCircle size={22} color="#ea580c" />
                  <Text style={styles.modalHeaderTitle}>Need help onboarding?</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setHelpModalOpen(false)}
                  style={styles.modalCloseIcon}
                >
                  <X size={20} color="#64748b" />
                </Pressable>
              </View>

              <Text style={styles.helpModalDescription}>
                Our partner operations team is here to assist you with your document submission, profile verification, and registration questions.
              </Text>

              <View style={styles.helpActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setHelpModalOpen(false);
                    void Linking.openURL("tel:+918008765832");
                  }}
                  style={styles.helpPrimaryAction}
                >
                  <Phone size={18} color="#ffffff" />
                  <Text style={styles.helpPrimaryActionText}>Call Support (+91 8008765832)</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setHelpModalOpen(false);
                    void Linking.openURL("https://wa.me/918008765832");
                  }}
                  style={styles.helpSecondaryAction}
                >
                  <Send size={18} color="#ea580c" />
                  <Text style={styles.helpSecondaryActionText}>WhatsApp Partner Support</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => setHelpModalOpen(false)}
                  style={styles.helpDismissButton}
                >
                  <Text style={styles.helpDismissButtonText}>Dismiss</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Screen 11: Profile Menu Bottom Sheet */}
        <ProfileMenuSheet
          visible={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          partnerName={application?.display_name || "webaura"}
          partnerPhone="+91 98765 43210"
          partnerInitial={initialLetter}
        />
      </View>
    </ApplyDockContext.Provider>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: "#faf8f5",
    minHeight: "100%",
  },
  headerContainer: {
    backgroundColor: "#faf8f5",
    borderBottomWidth: 0,
    borderColor: "transparent",
    zIndex: 20,
  },
  headerInner: {
    width: "100%",
    marginHorizontal: "auto",
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 48,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonPressed: {
    backgroundColor: "#f1f5f9",
  },
  backPlaceholder: {
    width: 36,
    height: 36,
  },
  logoCenter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 8,
  },
  logoTextNavy: {
    fontSize: 18,
    fontWeight: "800",
    color: "#00112e",
    letterSpacing: -0.3,
  },
  logoTextOrange: {
    color: "#f87000",
  },
  avatarBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff2e8",
    borderWidth: 1,
    borderColor: "#fed7aa",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBadgePressed: {
    backgroundColor: "#fed7aa",
  },
  avatarText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#f87000",
  },
  stepperWrapper: {
    width: "100%",
    alignSelf: "center",
  },
  progressRow: {
    width: "100%",
    marginHorizontal: "auto",
    flexDirection: "row",
    columnGap: 8,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
  },
  progressBarSegment: {
    flex: 1,
    height: 4.5,
    borderRadius: 14,
  },
  stepLabelRow: {
    width: "100%",
    marginHorizontal: "auto",
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
  },
  stepLabelText: {
    fontSize: 13.5,
    color: "#64748b",
    fontWeight: "500",
  },
  scrollView: {
    flex: 1,
    backgroundColor: "#faf8f5",
  },
  scrollContent: {
    width: "100%",
    marginHorizontal: "auto",
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  dockContainer: {
    position: Platform.OS === "web" ? ("fixed" as any) : "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    backgroundColor: "#faf8f5",
    borderTopWidth: 0,
    borderColor: "transparent",
    paddingHorizontal: 20,
    paddingTop: 12,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 -4px 16px rgba(0, 17, 46, 0.05)",
        } as any)
      : {
          elevation: 8,
          shadowColor: "#00112e",
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.06,
          shadowRadius: 10,
        }),
  },
  dockInner: {
    width: "100%",
    alignSelf: "center",
    flexDirection: "column",
    rowGap: 8,
  },
  conflictBanner: {
    borderRadius: 8,
    backgroundColor: "#fffbeb",
    padding: 10,
    borderWidth: 1,
    borderColor: "#fef3c7",
  },
  conflictTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#92400e",
  },
  conflictSubtitle: {
    fontSize: 12,
    color: "#b45309",
    marginTop: 2,
  },
  refusalBanner: {
    borderRadius: 12,
    backgroundColor: "#fff7ed",
    padding: 12,
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  refusalTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#c2410c",
  },
  refusalSubtitle: {
    fontSize: 13,
    color: "#7c2d12",
    marginTop: 2,
    lineHeight: 18,
  },
  failedBanner: {
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    padding: 10,
    borderWidth: 1,
    borderColor: "#fee2e2",
  },
  failedTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#991b1b",
  },
  failedSubtitle: {
    fontSize: 12,
    color: "#b91c1c",
    marginTop: 2,
  },
  dockActionRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  helpButton: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  helpButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#00112e",
    textDecorationLine: "underline",
  },
  continueButton: {
    height: 50,
    minWidth: 136,
    paddingHorizontal: 36,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 4px 14px rgba(234, 88, 12, 0.35)",
        } as any)
      : {
          elevation: 4,
          shadowColor: "#f87000",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
        }),
  },
  continueButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 8,
  },
  continueButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  continueButtonArrow: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
  },
  helpModalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: "#f1f5f9",
    paddingBottom: 14,
  },
  modalHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
  },
  modalHeaderTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#00112e",
  },
  modalCloseIcon: {
    padding: 6,
    borderRadius: 9999,
    backgroundColor: "#f1f5f9",
  },
  helpModalDescription: {
    fontSize: 14,
    lineHeight: 22,
    color: "#475569",
    marginTop: 14,
  },
  helpActions: {
    flexDirection: "column",
    rowGap: 10,
    marginTop: 20,
  },
  helpPrimaryAction: {
    backgroundColor: "#f87000",
    borderRadius: 9999,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 10,
  },
  helpPrimaryActionText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  helpSecondaryAction: {
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    borderRadius: 9999,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 10,
  },
  helpSecondaryActionText: {
    color: "#f87000",
    fontSize: 15,
    fontWeight: "700",
  },
  helpDismissButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  helpDismissButtonText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600",
  },
  profileModalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "80%",
  },
  profileHeaderInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarBadgeLarge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff2e8",
    borderWidth: 1,
    borderColor: "#fed7aa",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTextLarge: {
    fontSize: 18,
    fontWeight: "800",
    color: "#f87000",
  },
  profileNameText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#00112e",
  },
  profileStatusText: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  sheetSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 8,
  },
  stepsList: {
    flexDirection: "column",
    rowGap: 4,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  stepItemCurrent: {
    backgroundColor: "#fff7ed",
  },
  stepItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 10,
  },
  stepNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberBadgeCurrent: {
    backgroundColor: "#f87000",
  },
  stepNumberBadgeDone: {
    backgroundColor: "#15803d",
  },
  stepNumberBadgeFuture: {
    backgroundColor: "#e2e8f0",
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: "700",
  },
  stepItemLabel: {
    fontSize: 14,
    color: "#334155",
    fontWeight: "500",
  },
  profileModalFooter: {
    borderTopWidth: 1,
    borderColor: "#f1f5f9",
    marginTop: 18,
    paddingTop: 14,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 8,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    paddingVertical: 12,
    borderRadius: 9999,
  },
  signOutButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#be123c",
  },
});
