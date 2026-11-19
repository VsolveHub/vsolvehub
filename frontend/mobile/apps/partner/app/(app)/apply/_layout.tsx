// Ported from frontend/apps/partner/features/application/view/apply-shell.tsx
import { Text, useT } from "@vsolve/mobile-ui";
import { ApiRequestError } from "@vsolve/api-client";
import { useMobileLogout } from "@vsolve/mobile-core";
import { Redirect, Slot, usePathname, useRouter } from "expo-router";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  ChevronLeft,
  ChevronRight,
  Headphones,
  ListChecks,
  Send,
  User,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApplyDockContext, type DockConfig } from "@/features/application/model/dock-context";
import { previousStep, stepProgress } from "@/features/application/model/progress";
import { applicationSteps, nextStep } from "@/features/application/model/steps";
import { usePartnerApplication, usePartnerAvailability } from "@/features/application/queries";
import { OnboardingStepper } from "@/features/onboarding/components/onboarding-stepper";
import { isRequestOpen, usePrivacyRequests } from "@/features/account/privacy-queries";
import { DeleteAccountDialog } from "@/features/application/view/delete-account-dialog";
import { HelpSheet } from "@/features/application/view/help-sheet";
import { ProfileMenuSheet } from "@/features/onboarding/components/profile-menu-sheet";

const logoMark = require("../../../assets/logo-mark.png");

export default function ApplyLayout() {
  const pathname = usePathname();
  const isStatusPage = pathname === "/apply/status" || pathname.endsWith("/status");
  // The read-only profile preview gets the same header as the status page: a back arrow, no step
  // counter and no Continue dock.
  const isProfilePage = pathname === "/apply/profile";
  const isSideScreen = isStatusPage || isProfilePage;
  // `/apply` itself is the overview (the choice of how to join, then the checklist), as on the
  // website: no step counter and no Continue dock.
  const isOverview = pathname === "/apply" || pathname === "/apply/";
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const signOut = useMobileLogout("/login?next=%2Fapply");
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const [dockConfig, setDockConfig] = useState<DockConfig | null>(null);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [stepSheetOpen, setStepSheetOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const t = useT();
  const privacyRequests = usePrivacyRequests();
  const openDeletion = (privacyRequests.data ?? []).find(
    (item) => item.kind === "ERASURE" && isRequestOpen(item),
  );
  const deletionNote = openDeletion
    ? t("apply.account.delete.requested", {
        date: new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
          new Date(openDeletion.scheduled_for ?? openDeletion.requested_at),
        ),
      })
    : null;

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
  const availability = usePartnerAvailability();
  const missing = query.error instanceof ApiRequestError && query.error.status === 404;
  const application = missing ? null : (query.data ?? null);
  const pathSteps = stepProgress(application, availability.data).filter((s) => s.state !== "waypoint");

  // Pull down on the overview to check for a decision without restarting the app. Only there: on a
  // form step a refetch could reset what is being typed.
  // While the keyboard is open the screen shrinks to what is above it (`KeyboardAvoidingView`
  // below) and the Continue bar steps aside, so neither covers the field being typed in.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => {
      setKeyboardOpen(true);
      // Bring the field being typed in clear of the keyboard, whichever step it is on. A short
      // wait lets the screen finish resizing first.
      setTimeout(() => {
        const field = TextInput.State.currentlyFocusedInput();
        const content = scrollRef.current?.getInnerViewNode();
        if (!field || content == null) return;
        field.measureLayout(
          content,
          (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true }),
          () => undefined,
        );
      }, 120);
    });
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () =>
      setKeyboardOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const { refetch: refetchApplication } = query;
  const { refetch: refetchAvailability } = availability;
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchApplication(), refetchAvailability()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchApplication, refetchAvailability]);

  const isSubmitted = application?.status === "SUBMITTED" || application?.status === "UNDER_REVIEW";
  const back = isSideScreen ? { href: "/apply" } : (isSubmitted ? null : previousStep(pathname, application?.track));
  const shouldShowDock = !isSubmitted && !isSideScreen && !isOverview;

  // Find the current step in this partner's own sequence
  const steps = applicationSteps(application?.track);
  const currentStepIdx = Math.max(
    0,
    steps.findIndex((s) => s.href === pathname || pathname.startsWith(s.href)),
  );
  const currentStep = steps[currentStepIdx] ?? steps[0];

  // The applicant's own initial; with no name yet the avatar shows the person icon.
  const initialLetter = application?.display_name?.trim()[0]?.toUpperCase() ?? "";

  // Primary action button configuration with robust fallbacks
  const defaultLabel = currentStepIdx === steps.length - 1 ? "Send application" : "Continue";
  const primaryLabel = dockConfig?.label || defaultLabel;
  const isProceedDisabled = dockConfig ? Boolean(dockConfig.proceedDisabled) : false;
  const isSaving = dockConfig ? Boolean(dockConfig.isSaving) : false;

  const handlePrimaryPress = () => {
    if (isProceedDisabled || isSaving) return;
    if (onCommitRef.current) {
      onCommitRef.current();
      return;
    }
    const next = nextStep(pathname, application?.track);
    if (next) {
      router.push(next.href as any);
    }
  };

  // An approved Partner has finished onboarding: their place is the workspace, not this form.
  // Every way in (a sign-in with next=/apply, an Apply button, a back gesture) ends up here.
  if (application?.status === "APPROVED") return <Redirect href="/home" />;

  return (
    <ApplyDockContext.Provider value={{ dockConfig, registerDock }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.rootContainer}
      >
        {/* Top Header with Safe Area Spacing */}
        <View style={[styles.headerContainer, { paddingTop: topInset }]}>
          <View style={[styles.headerInner, { maxWidth: isDesktop ? 672 : "100%" }]}>
            {/* Left: On overview, display logo mark alone; otherwise back chevron + logo mark */}
            {isOverview ? (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Image
                  source={logoMark}
                  style={{ width: 30, height: 30 }}
                  resizeMode="contain"
                  accessibilityLabel="VSolve Hub"
                />
              </View>
            ) : isSideScreen ? (
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
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
                <Pressable cssInterop={false}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  onPress={() => {
                    const target = dockConfig?.backHref || back?.href || "/apply";
                    router.push(target as any);
                  }}
                  style={({ pressed }) => [
                    styles.backButton,
                    pressed ? styles.backButtonPressed : null,
                  ]}
                >
                  <ChevronLeft size={22} color="#00112e" strokeWidth={2.2} />
                </Pressable>
                <Pressable cssInterop={false}
                  accessibilityRole="button"
                  accessibilityLabel="VSolve Hub overview"
                  onPress={() => router.push("/apply" as any)}
                >
                  <Image
                    source={logoMark}
                    style={{ width: 30, height: 30 }}
                    resizeMode="contain"
                    accessibilityLabel="VSolve Hub"
                  />
                </Pressable>
              </View>
            )}

            {/* Center: Step X of Y on inner steps, omitted on overview and status */}
            {isOverview || isSideScreen ? null : (
              <Text style={styles.headerStepCounter}>
                {`Step ${currentStepIdx + 1} of ${steps.length}`}
              </Text>
            )}

            {/* Right: Actions */}
            <View style={{ flexDirection: "row", alignItems: "center", columnGap: 6 }}>
              <Pressable cssInterop={false}
                accessibilityRole="button"
                accessibilityLabel="View application steps"
                onPress={() => setStepSheetOpen(true)}
                style={({ pressed }) => [
                  styles.headerIconButton,
                  pressed ? styles.headerIconButtonPressed : null,
                ]}
              >
                <ListChecks size={20} color="#453f37" strokeWidth={2} />
              </Pressable>

              <Pressable cssInterop={false}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
                onPress={() => setNotificationsOpen(true)}
                style={({ pressed }) => [
                  styles.headerIconButton,
                  pressed ? styles.headerIconButtonPressed : null,
                ]}
              >
                <Bell size={20} color="#453f37" strokeWidth={2} />
              </Pressable>

              <Pressable cssInterop={false}
                accessibilityRole="button"
                accessibilityLabel="Partner profile & options"
                onPress={() => setProfileModalOpen(true)}
                style={({ pressed }) => [
                  styles.avatarBadgeNavy,
                  pressed ? styles.avatarBadgeNavyPressed : null,
                ]}
              >
                {initialLetter ? (
                  <Text style={styles.avatarTextWhite}>{initialLetter}</Text>
                ) : (
                  // No name saved yet: the person icon, never an invented letter.
                  <User size={16} color="#ffffff" strokeWidth={2.2} />
                )}
              </Pressable>
            </View>
          </View>
        </View>

        {/* Scrollable Main Content */}
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              maxWidth: isDesktop ? 672 : "100%",
              // Room under the last field while typing, so it can be scrolled clear of the keyboard.
              paddingBottom: keyboardOpen
                ? 96
                : (shouldShowDock || isStatusPage) ? bottomInset + 88 : 40,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
          refreshControl={
            isOverview ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f87000" colors={["#f87000"]} />
            ) : undefined
          }
        >
          <Slot />
        </ScrollView>

        {/* Fixed Bottom Action Dock Matching Mockups */}
        {shouldShowDock && !keyboardOpen ? (
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

              {/* Main Dock Row: "Back" on left, "Save and Continue" on right */}
              <View style={styles.dockActionRow}>
                {/* Left: Back */}
                <Pressable cssInterop={false}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  onPress={() => {
                    const target = dockConfig?.backHref || back?.href || "/apply";
                    router.push(target as any);
                  }}
                  style={({ pressed }) => [
                    styles.dockBackButton,
                    pressed ? { opacity: 0.7 } : null,
                  ]}
                >
                  <Text style={styles.dockBackButtonText}>Back</Text>
                </Pressable>

                {/* Right: Save and Continue */}
                <Pressable cssInterop={false}
                  accessibilityRole="button"
                  accessibilityLabel={primaryLabel}
                  disabled={isProceedDisabled || isSaving}
                  onPress={handlePrimaryPress}
                  style={({ pressed }) => [
                    styles.continueButton,
                    {
                      backgroundColor: isProceedDisabled
                        ? "#e8e5df"
                        : pressed
                        ? "#d65e00"
                        : "#f87000",
                      opacity: 1,
                    },
                  ]}
                >
                  {isSaving ? (
                    <ActivityIndicator color={isProceedDisabled ? "#78716c" : "#00112e"} size="small" />
                  ) : (
                    <View style={styles.continueButtonContent}>
                      <Text style={[styles.continueButtonText, isProceedDisabled ? { color: "#78716c" } : null]}>
                        {primaryLabel}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {/* "Need help?" bottom sheet, opened from the profile menu */}
        <HelpSheet open={helpModalOpen} onOpenChange={setHelpModalOpen} />

        {/* "Delete your account?" confirmation, opened from the profile menu */}
        <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />

        {/* Screen 11: Profile Menu Bottom Sheet */}
        <ProfileMenuSheet
          visible={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          partnerName={application?.display_name}
          partnerInitial={initialLetter}
          onOpenNotifications={() => setNotificationsOpen(true)}
          onOpenHelp={() => setHelpModalOpen(true)}
          onOpenDelete={() => setDeleteOpen(true)}
          deletionNote={deletionNote}
        />

        {/* 1. Step Sheet Modal Matching Design Reference */}
        <Modal
          visible={stepSheetOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setStepSheetOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              cssInterop={false}
              style={StyleSheet.absoluteFill}
              onPress={() => setStepSheetOpen(false)}
              accessibilityLabel="Dismiss steps dialog"
            />
            <View
              style={[
                styles.sheetModalCard,
                { paddingBottom: Math.max(bottomInset + 24, 36) },
              ]}
            >
              {/* Header: "Your steps" + Outlined Square Close Button */}
              <View style={styles.sheetModalHeader}>
                <Text style={styles.sheetModalTitle}>Your steps</Text>
                <Pressable
                  cssInterop={false}
                  accessibilityRole="button"
                  accessibilityLabel="Close steps sheet"
                  onPress={() => setStepSheetOpen(false)}
                  style={({ pressed }) => [
                    styles.sheetCloseButtonSquare,
                    pressed ? styles.sheetCloseButtonSquarePressed : null,
                  ]}
                >
                  <X size={20} color="#00112e" strokeWidth={2.2} />
                </Pressable>
              </View>

              {/* Steps List */}
              <View style={styles.sheetStepsList}>
                {pathSteps.map((step) => {
                  const isDone = step.state === "done";
                  const subtitle = isDone
                    ? "Done"
                    : step.state === "optional"
                      ? "Optional — you can set this later"
                      : step.outstanding === 1
                        ? "1 thing needed"
                        : `${step.outstanding} things needed`;

                  return (
                    <Pressable
                      key={step.href}
                      cssInterop={false}
                      accessibilityRole="button"
                      onPress={() => {
                        setStepSheetOpen(false);
                        router.push(step.href as any);
                      }}
                      style={({ pressed }) => [
                        styles.stepRowPressable,
                        pressed ? styles.stepRowPressed : null,
                      ]}
                    >
                      {/* Step Indicator */}
                      {isDone ? (
                        <View style={styles.stepIndicatorDone}>
                          <Check size={16} color="#ffffff" strokeWidth={3} />
                        </View>
                      ) : (
                        <View style={styles.stepIndicatorTodo} />
                      )}

                      {/* Title & Subtitle */}
                      <View style={styles.stepTextContainer}>
                        <Text style={styles.stepTitleText}>
                          {step.label}
                        </Text>
                        <Text style={styles.stepSubtitleText}>
                          {subtitle}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </Modal>

        {/* 2. Notifications Modal Matching Image 2 */}
        <Modal
          visible={notificationsOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setNotificationsOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              cssInterop={false}
              style={StyleSheet.absoluteFill}
              onPress={() => setNotificationsOpen(false)}
              accessibilityLabel="Dismiss notifications dialog"
            />
            <View
              style={[
                styles.sheetModalCard,
                { paddingBottom: Math.max(bottomInset + 20, 28) },
              ]}
            >
              {/* Header: "Notifications" + X Close Icon */}
              <View style={styles.sheetModalHeaderNotifications}>
                <Text style={styles.sheetModalTitle}>Notifications</Text>
                <Pressable
                  cssInterop={false}
                  accessibilityRole="button"
                  accessibilityLabel="Close notifications sheet"
                  onPress={() => setNotificationsOpen(false)}
                  style={({ pressed }) => [
                    styles.notificationCloseIconButton,
                    pressed ? styles.headerIconButtonPressed : null,
                  ]}
                >
                  <X size={20} color="#00112e" strokeWidth={2} />
                </Pressable>
              </View>

              {/* Dashed/Subtle Card Empty State */}
              <View
                style={{
                  marginTop: 18,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "#e7e2da",
                  backgroundColor: "#ffffff",
                  paddingVertical: 32,
                  paddingHorizontal: 20,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <BellOff size={28} color="#78716c" strokeWidth={1.8} />
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: "#00112e",
                    marginTop: 14,
                    textAlign: "center",
                  }}
                >
                  Nothing to read yet
                </Text>
                <Text
                  style={{
                    fontSize: 13.5,
                    lineHeight: 20,
                    color: "#453f37",
                    textAlign: "center",
                    marginTop: 8,
                    maxWidth: 320,
                  }}
                >
                  Vsolve tells you here when a job is confirmed, when a customer answers, and when money moves. There is nothing you need to do.
                </Text>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
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
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e7e2da",
    zIndex: 20,
  },
  headerInner: {
    width: "100%",
    marginHorizontal: "auto",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
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
  headerStepCounter: {
    fontSize: 14,
    fontWeight: "600",
    color: "#00112e",
    textAlign: "center",
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
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconButtonPressed: {
    backgroundColor: "#f4f1ec",
  },
  avatarBadgeNavy: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#00112e",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  avatarBadgeNavyPressed: {
    backgroundColor: "#00204d",
  },
  avatarTextWhite: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
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
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  dockContainer: {
    position: Platform.OS === "web" ? ("fixed" as any) : "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e7e2da",
    paddingHorizontal: 16,
    paddingTop: 12,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 -2px 10px rgba(0, 17, 46, 0.04)",
        } as any)
      : {
          elevation: 4,
          shadowColor: "#00112e",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.04,
          shadowRadius: 6,
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
    columnGap: 12,
  },
  dockBackButton: {
    height: 48,
    paddingHorizontal: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  dockBackButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#00112e",
  },
  continueButton: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  continueButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  continueButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#00112e",
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
  sheetModalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    width: "100%",
    maxWidth: 672,
    alignSelf: "center",
    shadowColor: "#00112e",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 12,
  },
  sheetModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingBottom: 16,
  },
  sheetModalHeaderNotifications: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingBottom: 14,
  },
  sheetModalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#00112e",
    letterSpacing: -0.3,
  },
  sheetCloseButtonSquare: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#00112e",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  sheetCloseButtonSquarePressed: {
    backgroundColor: "#f4f1ec",
  },
  sheetStepsList: {
    width: "100%",
    flexDirection: "column",
    paddingTop: 4,
  },
  stepRowPressable: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },
  stepRowPressed: {
    backgroundColor: "#f8fafc",
  },
  stepIndicatorDone: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#15803d",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 18,
  },
  stepIndicatorTodo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: "#ea580c",
    backgroundColor: "transparent",
    marginRight: 18,
  },
  stepTextContainer: {
    flex: 1,
    justifyContent: "center",
  },
  stepTitleText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#00112e",
    lineHeight: 22,
  },
  stepSubtitleText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748b",
    marginTop: 2,
    lineHeight: 18,
  },
  notificationCloseIconButton: {
    padding: 6,
    borderRadius: 8,
  },
});
