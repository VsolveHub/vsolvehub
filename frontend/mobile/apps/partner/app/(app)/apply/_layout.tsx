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
import { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

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
  const signOut = useMobileLogout();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const [sheetOpen, setSheetOpen] = useState(false);

  const query = usePartnerApplication();
  const missing = query.error instanceof ApiRequestError && query.error.status === 404;
  const application = missing ? null : (query.data ?? null);

  const steps = stepProgress(application);
  const isSubmitted = application?.status === "SUBMITTED" || application?.status === "UNDER_REVIEW";
  const back = isSubmitted ? null : previousStep(pathname);
  const currentStepIdx = steps.findIndex((s) => s.href === pathname);

  return (
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
            maxWidth: 1200,
            width: "100%",
            marginHorizontal: "auto",
            borderRadius: 9999,
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            borderWidth: 1,
            borderColor: "rgba(226, 232, 240, 0.9)",
            paddingHorizontal: isDesktop ? 20 : 14,
            paddingVertical: isDesktop ? 10 : 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            ...(Platform.OS === "web"
              ? ({
                  backdropFilter: "blur(20px)",
                  boxShadow:
                    "0 12px 32px rgba(0, 17, 46, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)",
                } as any)
              : {
                  elevation: 6,
                  shadowColor: "#00112e",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.1,
                  shadowRadius: 12,
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
                  backgroundColor: "#f8fafc",
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
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
                  backgroundColor: "#f8fafc",
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  marginLeft: 12,
                }}
              >
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 9999,
                    backgroundColor: "#10b981",
                  }}
                />
                <Text style={{ fontSize: 11, color: "#64748b", fontWeight: "500" }}>
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
                backgroundColor: "rgba(248, 250, 252, 0.8)",
                borderWidth: 1,
                borderColor: "#e2e8f0",
                paddingHorizontal: 16,
                paddingVertical: 6,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "800", color: "#00112e" }}>
                {isSubmitted
                  ? "Application Submitted"
                  : pathname === "/apply"
                  ? "Registration Hub"
                  : currentStepIdx >= 0
                  ? `Step ${currentStepIdx + 1} of ${steps.length}`
                  : "Application"}
              </Text>
              <Text style={{ fontSize: 12, color: "#94a3b8" }}>•</Text>
              <Text style={{ fontSize: 12, fontWeight: "500", color: "#64748b" }}>
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
                  backgroundColor: pressed ? "#f1f5f9" : "#f8fafc",
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  columnGap: 6,
                })}
              >
                <ListChecks size={15} color="#00112e" />
                {isDesktop ? (
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#00112e" }}>
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
                  backgroundColor: pressed ? "#f1f5f9" : "#f8fafc",
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#00112e" }}>
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
                backgroundColor: pressed ? "#ffe4e6" : "#fff1f2",
                borderWidth: 1,
                borderColor: "rgba(254, 205, 211, 0.9)",
                flexDirection: "row",
                alignItems: "center",
                columnGap: 5,
              })}
            >
              <LogOut size={13} color="#be123c" />
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#be123c" }}>
                Sign Out
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Main Form Scroll View with ample clearance for floating navbar */}
      <ScrollView
        contentContainerStyle={{
          maxWidth: isDesktop ? 1120 : 560,
          width: "100%",
          marginHorizontal: "auto",
          paddingHorizontal: isDesktop ? 32 : 16,
          paddingTop: isDesktop ? 108 : 88,
          paddingBottom: 64,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Slot />
      </ScrollView>

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
              borderColor: "rgba(226, 232, 240, 0.9)",
              padding: 24,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              zIndex: 10,
              flexDirection: "column",
            }}
          >
            {/* Modal Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 16,
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
                    fontSize: 12.5,
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
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={() => setSheetOpen(false)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#f8fafc",
                }}
              >
                <X size={16} color="#64748b" />
              </Pressable>
            </View>

            {/* Steps List */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ rowGap: 4, paddingBottom: 6 }}
            >
              {steps.map((step) => {
                const isCurrent = pathname === step.href;
                return (
                  <Pressable
                    key={step.href}
                    accessibilityRole="button"
                    accessibilityLabel={step.label}
                    onPress={() => {
                      setSheetOpen(false);
                      router.push(step.href as never);
                    }}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      columnGap: 14,
                      borderRadius: 14,
                      borderWidth: isCurrent ? 1.5 : 1,
                      borderColor: isCurrent ? "#93c5fd" : "transparent",
                      backgroundColor: isCurrent
                        ? "#eff6ff"
                        : pressed
                        ? "#f8fafc"
                        : "transparent",
                      paddingVertical: isCurrent ? 11 : 9,
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
