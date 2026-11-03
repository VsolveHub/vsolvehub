// Ported faithfully from frontend/apps/partner/features/application/view/apply-shell.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { useMobileLogout } from "@vsolve/mobile-core";
import { Logo, Sheet, Text, cn } from "@vsolve/mobile-ui";
import { Slot, usePathname, useRouter } from "expo-router";
import {
  Check,
  ChevronLeft,
  ListChecks,
  LogOut,
} from "lucide-react-native";
import { useState } from "react";
import { Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";

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

      {/* Steps List Sheet Modal */}
      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Your application"
        description="Fill these in any order. Everything saves as you go."
      >
        <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ rowGap: 6, paddingBottom: 16 }}>
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
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  columnGap: 12,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: isCurrent ? "#00112e" : "#e2e8f0",
                  backgroundColor: isCurrent ? "#f1f5f9" : "#ffffff",
                  padding: 12,
                }}
              >
                <StepMark state={step.state} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: isCurrent ? "800" : "600",
                      color: "#00112e",
                    }}
                  >
                    {step.label}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    {describe(step, isCurrent)}
                  </Text>
                </View>
              </Pressable>
            );
          })}

          <View style={{ marginTop: 16, borderTopWidth: 1, borderColor: "#e2e8f0", paddingTop: 12 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSheetOpen(false);
                void signOut();
              }}
              style={{
                width: "100%",
                height: 44,
                borderRadius: 12,
                backgroundColor: "#fff1f2",
                borderWidth: 1,
                borderColor: "#fecdd3",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                columnGap: 8,
              }}
            >
              <LogOut size={16} color="#be123c" />
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#be123c" }}>
                Sign Out
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </Sheet>
    </View>
  );
}

function StepMark({ state }: { state: StepProgress["state"] }) {
  if (state === "done") {
    return (
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 9999,
          backgroundColor: "#10b981",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Check size={14} color="#ffffff" strokeWidth={3} />
      </View>
    );
  }

  if (state === "todo") {
    return (
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 9999,
          borderWidth: 2,
          borderColor: "#f87000",
        }}
      />
    );
  }

  return (
    <View
      style={{
        width: 24,
        height: 24,
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
  if (step.state === "waypoint") {
    return step.href === "/apply" ? "Where everything stands" : "Check it, then send it";
  }
  if (step.state === "optional") return "Optional — you can set this later";
  if (step.state === "done") return "Done";
  if (isCurrent) return "You are here";
  return step.outstanding === 1 ? "1 thing needed" : `${step.outstanding} things needed`;
}
