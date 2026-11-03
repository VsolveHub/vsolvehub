// Ported faithfully from frontend/apps/partner/features/application/view/apply-shell.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { useMobileLogout } from "@vsolve/mobile-core";
import { Logo, Text, cn } from "@vsolve/mobile-ui";
import { Slot, usePathname, useRouter } from "expo-router";
import {
  Check,
  ChevronLeft,
  ListChecks,
  LogOut,
  X,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import { ApplyDockContext, type DockConfig } from "@/features/application/model/dock-context";
import {
  previousStep,
  progressSummary,
  stepProgress,
  type StepProgress,
} from "@/features/application/model/progress";
import { usePartnerApplication } from "@/features/application/queries";

export default function ApplyLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const signOut = useMobileLogout("/login?next=%2Fapply");
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dockConfig, setDockConfig] = useState<DockConfig | null>(null);

  const registerDock = useCallback((config: DockConfig | null) => {
    setDockConfig((prev) => {
      if (prev === null && config === null) return prev;
      if (
        prev !== null &&
        config !== null &&
        prev.label === config.label &&
        prev.backHref === config.backHref &&
        prev.nextStepName === config.nextStepName &&
        prev.isSaving === config.isSaving &&
        prev.proceedDisabled === config.proceedDisabled &&
        prev.saved === config.saved &&
        prev.conflict === config.conflict &&
        prev.refusal?.message === config.refusal?.message &&
        prev.failed === config.failed &&
        prev.requestId === config.requestId &&
        prev.fieldMessages.join(",") === config.fieldMessages.join(",") &&
        prev.onCommit === config.onCommit
      ) {
        return prev;
      }
      return config;
    });
  }, []);

  const query = usePartnerApplication();
  const missing = query.error instanceof ApiRequestError && query.error.status === 404;
  const application = missing ? null : (query.data ?? null);

  const steps = stepProgress(application);
  const isSubmitted = application?.status === "SUBMITTED" || application?.status === "UNDER_REVIEW";
  const back = isSubmitted ? null : previousStep(pathname);
  const currentStepIdx = steps.findIndex((s) => s.href === pathname);

  return (
    <ApplyDockContext.Provider value={{ dockConfig, registerDock }}>
      <View style={{ flex: 1, backgroundColor: "#fbf9f6", minHeight: "100%" }}>
      {/* Floating Dynamic-Island Navigation Bar Matching Web */}
      <View
        pointerEvents="box-none"
        style={{
          position: Platform.OS === "web" ? ("fixed" as any) : "absolute",
          top: isDesktop ? 12 : 10,
          left: 0,
          right: 0,
          zIndex: 50,
          paddingHorizontal: isDesktop ? 24 : 12,
        }}
      >
        <View
          style={{
            maxWidth: width >= 1280 ? 1280 : 1152, // max-w-6xl xl:max-w-7xl
            width: "100%",
            marginHorizontal: "auto",
            borderRadius: 9999,
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            borderWidth: 1,
            borderColor: "#d3ccc0", // border-line-strong
            paddingHorizontal: isDesktop ? 20 : 14,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            ...(Platform.OS === "web"
              ? ({
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  boxShadow:
                    "0 12px 32px rgba(0, 17, 46, 0.12), 0 1px 3px rgba(0, 0, 0, 0.05)",
                } as any)
              : {
                  elevation: 8,
                  shadowColor: "#00112e",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.12,
                  shadowRadius: 16,
                }),
          }}
        >
          {/* Left: Brand + Now Onboarding Tag */}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {back !== null && pathname !== "/apply" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={() => router.push(back.href as any)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9999,
                  backgroundColor: "#f4f1ec",
                  borderWidth: 1,
                  borderColor: "#d3ccc0",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 8,
                }}
              >
                <ChevronLeft size={16} color="#00112e" />
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/apply")}
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              <Logo />
            </Pressable>

            {/* Desktop City Pill */}
            {isDesktop ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  columnGap: 8,
                  borderRadius: 9999,
                  backgroundColor: "#f4f1ec", // bg-surface-sunken
                  borderWidth: 1,
                  borderColor: "#e7e2da", // border-line
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  marginLeft: 12,
                }}
              >
                {/* Pulsing Green Dot */}
                <View style={{ width: 8, height: 8, position: "relative", alignItems: "center", justifyContent: "center" }}>
                  <View
                    style={{
                      position: "absolute",
                      width: 8,
                      height: 8,
                      borderRadius: 9999,
                      backgroundColor: "#34d399",
                      opacity: 0.75,
                    }}
                  />
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 9999,
                      backgroundColor: "#059669",
                    }}
                  />
                </View>
                <Text style={{ fontSize: 11, color: "#453f37", fontWeight: "500", fontFamily: "system-ui, -apple-system, sans-serif" }}>
                  Now onboarding:{" "}
                  <Text style={{ fontWeight: "700", color: "#00112e" }}>Hyderabad</Text>
                </Text>
              </View>
            ) : null}
          </View>

          {/* Desktop Center: Registration Hub Capsule */}
          {isDesktop ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                columnGap: 8,
                borderRadius: 9999,
                backgroundColor: "rgba(244, 241, 236, 0.8)", // bg-surface-sunken/80
                borderWidth: 1,
                borderColor: "#d3ccc0", // border-line-strong
                paddingHorizontal: 16,
                paddingVertical: 6,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "800", color: "#00112e", fontFamily: "system-ui, -apple-system, sans-serif" }}>
                {isSubmitted
                  ? "Application Submitted"
                  : pathname === "/apply"
                  ? "Registration Hub"
                  : currentStepIdx >= 0
                  ? `Step ${currentStepIdx + 1} of ${steps.length}`
                  : "Application"}
              </Text>
              <Text style={{ fontSize: 12, color: "#a89f90" }}>•</Text>
              <Text style={{ fontSize: 12, fontWeight: "500", color: "#453f37", fontFamily: "system-ui, -apple-system, sans-serif" }}>
                Desktop Verification Mode
              </Text>
            </View>
          ) : null}

          {/* Right: Steps, Overview & Sign Out */}
          <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
            {!isSubmitted ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Steps"
                onPress={() => setSheetOpen(true)}
                style={({ pressed }) => ({
                  height: 32,
                  paddingHorizontal: isDesktop ? 12 : 8,
                  width: isDesktop ? undefined : 32,
                  borderRadius: 9999,
                  backgroundColor: pressed ? "#ffffff" : "#f4f1ec", // bg-surface-sunken
                  borderWidth: 1,
                  borderColor: "#d3ccc0", // border-line-strong
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  columnGap: 6,
                  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                })}
              >
                <ListChecks size={14} color="#00112e" />
                {isDesktop ? (
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#00112e", fontFamily: "system-ui, -apple-system, sans-serif" }}>
                    Steps
                  </Text>
                ) : null}
              </Pressable>
            ) : null}

            {isDesktop ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Overview"
                onPress={() => router.push("/apply")}
                style={({ pressed }) => ({
                  height: 32,
                  paddingHorizontal: 14,
                  borderRadius: 9999,
                  backgroundColor: pressed ? "#ffffff" : "#f4f1ec", // bg-surface-sunken
                  borderWidth: 1,
                  borderColor: "#d3ccc0", // border-line-strong
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#00112e", fontFamily: "system-ui, -apple-system, sans-serif" }}>
                  Overview
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign Out"
              onPress={() => void signOut()}
              style={({ pressed }) => ({
                height: 32,
                paddingHorizontal: 12,
                borderRadius: 9999,
                backgroundColor: pressed ? "#ffe4e6" : "#fff1f2", // bg-rose-50
                borderWidth: 1,
                borderColor: "rgba(254, 205, 211, 0.9)", // border-rose-200/90
                flexDirection: "row",
                alignItems: "center",
                columnGap: 5,
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
              })}
            >
              <LogOut size={13} color="#be123c" />
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#be123c", fontFamily: "system-ui, -apple-system, sans-serif" }}>
                Sign Out
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Main Form Scroll View with ample clearance matching web's pt-24 sm:pt-28 lg:pt-32 */}
      <ScrollView
        style={{ flex: 1, backgroundColor: "#fbf9f6" }}
        contentContainerStyle={{
          maxWidth: width >= 1280 ? 1152 : isDesktop ? 1024 : 672,
          width: "100%",
          marginHorizontal: "auto",
          paddingHorizontal: isDesktop ? 32 : 16,
          paddingTop: isDesktop ? 128 : 96,
          paddingBottom: dockConfig ? 140 : 64,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Slot />
      </ScrollView>

      {/* Fixed Bottom Action Dock Matching Web Reference UI */}
      {dockConfig ? (
        <View
          style={{
            position: Platform.OS === "web" ? ("fixed" as any) : "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            backgroundColor: "rgba(255, 255, 255, 0.96)",
            borderTopWidth: 1,
            borderColor: "#e7e2da",
            ...(Platform.OS === "web"
              ? ({
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  boxShadow: "0 -4px 20px rgba(0, 17, 46, 0.08)",
                } as any)
              : {
                  elevation: 16,
                  shadowColor: "#00112e",
                  shadowOffset: { width: 0, height: -4 },
                  shadowOpacity: 0.08,
                  shadowRadius: 16,
                }),
          }}
        >
          <View
            style={{
              maxWidth: width >= 1280 ? 1152 : isDesktop ? 1024 : 672,
              width: "100%",
              marginHorizontal: "auto",
              paddingHorizontal: isDesktop ? 32 : 16,
              paddingTop: 12,
              paddingBottom: Platform.OS === "web" ? "calc(env(safe-area-inset-bottom, 0px) + 12px)" : 16,
              flexDirection: "column",
              rowGap: 8,
            }}
          >
            {dockConfig.conflict ? (
              <View style={{ borderRadius: 8, backgroundColor: "#fffbeb", padding: 10, borderWidth: 1, borderColor: "#fef3c7" }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#92400e" }}>
                  Someone else changed this application
                </Text>
                <Text style={{ fontSize: 12, color: "#b45309", marginTop: 2 }}>
                  We have reloaded the latest version so you can see it before saving again.
                </Text>
              </View>
            ) : null}

            {dockConfig.refusal ? (
              <View style={{ borderRadius: 8, backgroundColor: "#fff7ed", padding: 10, borderWidth: 1, borderColor: "#ffedd5" }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#c2410c" }}>
                  {dockConfig.refusal.title}
                </Text>
                <Text style={{ fontSize: 12, color: "#9a3412", marginTop: 2 }}>
                  {dockConfig.refusal.message}
                </Text>
              </View>
            ) : null}

            {dockConfig.failed ? (
              <View style={{ borderRadius: 8, backgroundColor: "#fef2f2", padding: 10, borderWidth: 1, borderColor: "#fee2e2" }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#991b1b" }}>
                  We could not save this
                </Text>
                <Text style={{ fontSize: 12, color: "#b91c1c", marginTop: 2 }}>
                  Nothing was changed. Check your connection and try again.
                </Text>
              </View>
            ) : null}

            {dockConfig.fieldMessages.length > 0 ? (
              <View style={{ flexDirection: "column", rowGap: 4 }}>
                {dockConfig.fieldMessages.map((msg) => (
                  <Text key={msg} style={{ fontSize: 13, fontWeight: "600", color: "#be123c" }}>
                    {msg}
                  </Text>
                ))}
              </View>
            ) : null}

            {dockConfig.saved && !dockConfig.conflict && !dockConfig.failed ? (
              <Text style={{ textAlign: "center", fontSize: 13, fontWeight: "700", color: "#15803d" }}>
                ✓ Changes saved securely.
              </Text>
            ) : null}

            {/* Buttons Row */}
            <View style={{ flexDirection: "row", alignItems: "center", columnGap: 10 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={() => router.push(dockConfig.backHref as any)}
                style={({ pressed }) => ({
                  height: 48,
                  paddingHorizontal: 24,
                  borderRadius: 12,
                  backgroundColor: pressed ? "#f4f1ec" : "#ffffff",
                  borderWidth: 1,
                  borderColor: "#d3ccc0",
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#00112e", fontFamily: "system-ui, -apple-system, sans-serif" }}>
                  Back
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={dockConfig.label}
                disabled={dockConfig.proceedDisabled || dockConfig.isSaving}
                onPress={dockConfig.onCommit}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 48,
                  borderRadius: 12,
                  backgroundColor: dockConfig.proceedDisabled
                    ? "#fed7aa"
                    : pressed
                    ? "#ea580c"
                    : "#ff6a00",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 4px rgba(255, 106, 0, 0.25)",
                  opacity: dockConfig.proceedDisabled ? 0.6 : 1,
                })}
              >
                {dockConfig.isSaving ? (
                  <ActivityIndicator color="#00112e" size="small" />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: "800", color: "#00112e", fontFamily: "system-ui, -apple-system, sans-serif" }}>
                    {dockConfig.label}
                  </Text>
                )}
              </Pressable>
            </View>

            {dockConfig.nextStepName ? (
              <Text
                style={{
                  textAlign: "center",
                  fontSize: 11,
                  fontWeight: "600",
                  color: "#78716c",
                  marginTop: 4,
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
              >
                Auto-saves as you type • Tap to proceed to {dockConfig.nextStepName}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Centered Steps Pop-up Dialog Matching Web Exact UI */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSheetOpen(false)}
      >
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 16,
            paddingVertical: 24,
            backgroundColor: "rgba(0, 17, 46, 0.45)",
            ...(Platform.OS === "web" ? ({ backdropFilter: "blur(8px)" } as any) : {}),
          }}
        >
          {/* Backdrop dismiss */}
          <Pressable
            accessibilityLabel="Close dialog backdrop"
            onPress={() => setSheetOpen(false)}
            style={StyleSheet.absoluteFill}
          />

          {/* Centered Modal Card */}
          <View
            style={{
              width: "100%",
              maxWidth: 440,
              maxHeight: "90%",
              borderRadius: 24,
              backgroundColor: "#ffffff",
              borderWidth: 1,
              borderColor: "#e2e8f0",
              padding: 24,
              boxShadow: "0 24px 64px rgba(0, 17, 46, 0.25)",
              elevation: 24,
            }}
          >
            {/* Modal Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "800",
                    color: "#00112e",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                  }}
                >
                  Your application
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: "#64748b",
                    marginTop: 3,
                    fontFamily: "system-ui, -apple-system, sans-serif",
                  }}
                >
                  Fill these in any order. Everything saves as you go.
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close steps dialog"
                onPress={() => setSheetOpen(false)}
                style={({ pressed }) => ({
                  width: 32,
                  height: 32,
                  borderRadius: 9999,
                  backgroundColor: pressed ? "#f1f5f9" : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <X size={18} color="#64748b" />
              </Pressable>
            </View>

            {/* Steps List */}
            <ScrollView
              style={{ maxHeight: 380, marginTop: 10 }}
              contentContainerStyle={{ rowGap: 8, paddingVertical: 4 }}
              showsVerticalScrollIndicator={false}
            >
              {steps.map((step) => {
                const isCurrent = step.href === pathname;
                return (
                  <Pressable
                    key={step.href}
                    accessibilityRole="button"
                    onPress={() => {
                      setSheetOpen(false);
                      router.push(step.href as any);
                    }}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      columnGap: 12,
                      paddingVertical: 10,
                      borderRadius: 14,
                      backgroundColor: isCurrent
                        ? "#f0f4ff"
                        : pressed
                        ? "#f8fafc"
                        : "transparent",
                      borderWidth: isCurrent ? 1 : 0,
                      borderColor: isCurrent ? "#c7d7fe" : "transparent",
                      paddingHorizontal: 12,
                    })}
                  >
                    <StepMark state={step.state} isCurrent={isCurrent} />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: isCurrent ? "800" : "600",
                          color: "#00112e",
                          fontFamily: "system-ui, -apple-system, sans-serif",
                        }}
                      >
                        {step.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                          marginTop: 1,
                          fontFamily: "system-ui, -apple-system, sans-serif",
                        }}
                      >
                        {describe(step, isCurrent)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Bottom Sign Out Button */}
            <View style={{ marginTop: 14, borderTopWidth: 1, borderColor: "#f1f5f9", paddingTop: 14 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign Out"
                onPress={() => {
                  setSheetOpen(false);
                  void signOut();
                }}
                style={({ pressed }) => ({
                  width: "100%",
                  height: 42,
                  borderRadius: 14,
                  backgroundColor: pressed ? "#ffe4e6" : "#fff1f2",
                  borderWidth: 1,
                  borderColor: "rgba(254, 205, 211, 0.9)",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  columnGap: 8,
                })}
              >
                <LogOut size={15} color="#be123c" />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: "#be123c",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                  }}
                >
                  Sign Out
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
    </ApplyDockContext.Provider>
  );
}

function StepMark({ state, isCurrent }: { state: StepProgress["state"]; isCurrent?: boolean }) {
  if (state === "done") {
    return (
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 9999,
          backgroundColor: "#10b981",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Check size={13} color="#ffffff" strokeWidth={3} />
      </View>
    );
  }

  if (isCurrent || state === "waypoint") {
    return (
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 9999,
          borderWidth: 2,
          borderColor: isCurrent ? "#64748b" : "#94a3b8",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "transparent",
        }}
      >
        <View
          style={{
            width: isCurrent ? 6 : 5,
            height: isCurrent ? 6 : 5,
            borderRadius: 9999,
            backgroundColor: isCurrent ? "#00112e" : "#64748b",
          }}
        />
      </View>
    );
  }

  if (state === "todo") {
    return (
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 9999,
          borderWidth: 2,
          borderColor: "#f59e0b",
          backgroundColor: "transparent",
        }}
      />
    );
  }

  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 9999,
        borderWidth: 2,
        borderColor: "#cbd5e1",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          borderRadius: 9999,
          backgroundColor: "#94a3b8",
          width: state === "optional" ? 8 : 4,
          height: state === "optional" ? 2 : 4,
        }}
      />
    </View>
  );
}

function describe(step: StepProgress, isCurrent: boolean): string {
  if (step.href === "/apply") return "Where everything stands";
  if (step.href === "/apply/review") return "Check it, then send it";
  if (step.state === "optional") return "Optional — you can set this later";
  if (step.state === "done") return "Done";
  return step.outstanding === 1 ? "1 thing needed" : `${step.outstanding} things needed`;
}
