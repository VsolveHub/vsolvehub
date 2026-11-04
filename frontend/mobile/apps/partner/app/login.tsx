// Ported faithfully from frontend/apps/partner/features/session/view/login-screen.tsx
// 100% identical navbar, responsive layout, structure, tokens, and same-tab navigation.

import { ApiRequestError } from "@vsolve/api-client";
import { safeNextPath } from "@vsolve/query/native";
import { useAuthStore, useMobileOtpFlow } from "@vsolve/mobile-core";
import { Card, OtpForm, Text } from "@vsolve/mobile-ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  CheckCircle2,
  HelpCircle,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react-native";
import { useEffect } from "react";
import { Platform, Pressable, ScrollView, StatusBar, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MarketingHeader } from "@/components/marketing-header";
import { usePartnerApplication } from "@/features/application/queries";
import { homeForApplication } from "@/features/session/model/redirect";

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string; phone?: string; switch?: string }>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'ios' ? 48 : (StatusBar.currentHeight ?? 16),
  );
  const heroPaddingTop = isDesktop
    ? 136
    : topInset + (Platform.OS === 'web' ? 76 : 88);

  const status = useAuthStore((state) => state.status);
  const signedIn = status === "signedIn";
  const application = usePartnerApplication({ enabled: signedIn });
  const flow = useMobileOtpFlow();
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const missing = application.error instanceof ApiRequestError && application.error.status === 404;
  const knowsWhereToGo = !application.isPending || missing;

  // Prefill phone if provided in query params
  useEffect(() => {
    if (params.phone && flow.phase === "phone") {
      flow.onPhoneChange(params.phone);
    }
  }, [flow, params.phone]);

  // Handle account switch if switch=true is explicitly requested
  useEffect(() => {
    if (params.switch === "true" && signedIn) {
      void useAuthStore.getState().signOut();
    }
  }, [params.switch, signedIn]);

  // Handle redirect after sign in (with brief delay if already signed in so user can switch)
  useEffect(() => {
    if (!signedIn || !knowsWhereToGo || params.switch === "true") return;
    const timer = setTimeout(() => {
      if (next) {
        router.replace(next as never);
        return;
      }
      router.replace(homeForApplication(missing ? null : (application.data?.status ?? null)));
    }, 1200);
    return () => clearTimeout(timer);
  }, [application.data?.status, knowsWhereToGo, missing, next, params.switch, router, signedIn]);

  if (status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-text-secondary">Checking your session…</Text>
      </View>
    );
  }

  if (signedIn && params.switch !== "true") {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-4">
        <View
          style={{
            width: "100%",
            maxWidth: 420,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: "#d3ccc0",
            backgroundColor: "#ffffff",
            padding: 24,
            alignItems: "center",
            boxShadow: "0 16px 40px rgba(0, 17, 46, 0.12)",
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "900", color: "#00112e", marginBottom: 6 }}>
            Already Signed In
          </Text>
          <Text style={{ fontSize: 13, color: "#756c5e", textAlign: "center", marginBottom: 20 }}>
            Taking you to your application…
          </Text>
          <View style={{ width: "100%", rowGap: 10 }}>
            <Pressable cssInterop={false}
              accessibilityRole="button"
              onPress={() => router.replace((next ?? "/apply") as never)}
              style={({ pressed }) => ({
                width: "100%",
                height: 44,
                borderRadius: 12,
                backgroundColor: pressed ? "#e06400" : "#f87000",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#ffffff" }}>
                Continue to Application
              </Text>
            </Pressable>
            <Pressable cssInterop={false}
              accessibilityRole="button"
              onPress={async () => {
                await useAuthStore.getState().signOut();
                router.replace(`/login?next=${encodeURIComponent(next ?? "/apply")}&switch=true` as never);
              }}
              style={({ pressed }) => ({
                width: "100%",
                height: 44,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#e7e2da",
                backgroundColor: pressed ? "#f1ede7" : "#f4f1ec",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#00112e" }}>
                Sign in with a different number
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      {/* Floating Dynamic-Island Navigation Matching Web Partner Portal */}
      <MarketingHeader />

      {/* Page Content */}
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerStyle={{
          paddingTop: heroPaddingTop,
          paddingBottom: 48,
          paddingHorizontal: 16,
          alignItems: 'center',
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            width: "100%",
            maxWidth: width >= 1280 ? 1152 : isDesktop ? 1024 : 448, // max-w-md lg:max-w-5xl xl:max-w-6xl
            marginHorizontal: "auto",
            flexDirection: isDesktop ? "row" : "column",
            alignItems: isDesktop ? "center" : "stretch",
            justifyContent: isDesktop ? "space-between" : "flex-start",
            columnGap: 48,
            rowGap: 32,
          }}
        >
          {/* Desktop Left Column: Registration Portal Value Prop */}
          {isDesktop ? (
            <View style={{ flex: 1.3, maxWidth: 560, rowGap: 24, paddingRight: 16 }}>
              {/* Badges */}
              <View style={{ flexDirection: "row", alignItems: "center", columnGap: 10 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    columnGap: 6,
                    borderRadius: 9999,
                    borderWidth: 1,
                    borderColor: "#d3ccc0", // border-line-strong
                    backgroundColor: "#f4f1ec", // bg-surface-sunken
                    paddingHorizontal: 14,
                    paddingVertical: 5,
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: "#059669" }} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#00112e" }}>
                    Partner Onboarding Portal
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    columnGap: 6,
                    borderRadius: 9999,
                    borderWidth: 1,
                    borderColor: "rgba(252, 211, 77, 0.6)",
                    backgroundColor: "#fffbeb",
                    paddingHorizontal: 14,
                    paddingVertical: 5,
                  }}
                >
                  <Sparkles size={13} color="#d97706" />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#92400e" }}>
                    Desktop Registration
                  </Text>
                </View>
              </View>

              {/* Headline & Paragraph */}
              <View style={{ rowGap: 12 }}>
                <Text
                  style={{
                    fontSize: 44,
                    fontWeight: "900",
                    letterSpacing: -0.8,
                    lineHeight: 50,
                    color: "#00112e",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                  }}
                >
                  Register & Verify as a Partner on Desktop
                </Text>
                <Text
                  style={{
                    fontSize: 16,
                    lineHeight: 26,
                    color: "#453f37", // text-text-secondary
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    maxWidth: 500,
                  }}
                >
                  Enter your mobile number to register as a new partner or continue your document verification. Once approved, live dispatches operate exclusively on our Partner Mobile App.
                </Text>
              </View>

              {/* 2 Feature Pillar Cards */}
              <View style={{ flexDirection: "row", columnGap: 14, paddingTop: 6 }}>
                <View
                  style={{
                    flex: 1,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "#e7e2da", // border-line
                    backgroundColor: "#ffffff",
                    padding: 16,
                    rowGap: 6,
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
                    <ShieldCheck size={16} color="#059669" />
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#00112e" }}>
                      KYC & Document Review
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, lineHeight: 18, color: "#453f37" }}>
                    Fast 24-hour verification for Government ID, Address Proof & bank accounts.
                  </Text>
                </View>

                <View
                  style={{
                    flex: 1,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "#e7e2da",
                    backgroundColor: "#ffffff",
                    padding: 16,
                    rowGap: 6,
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
                    <Smartphone size={16} color="#2563eb" />
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#00112e" }}>
                      Mobile App Operations
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, lineHeight: 18, color: "#453f37" }}>
                    Daily job requests, turn-by-turn navigation, and customer chat run on phone.
                  </Text>
                </View>
              </View>

              {/* Trust Indicators */}
              <View style={{ flexDirection: "row", alignItems: "center", columnGap: 16, paddingTop: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", columnGap: 6 }}>
                  <CheckCircle2 size={15} color="#059669" />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#756c5e" }}>
                    15,000+ Verified Partners
                  </Text>
                </View>
                <Text style={{ color: "#a89f90" }}>•</Text>
                <View style={{ flexDirection: "row", alignItems: "center", columnGap: 6 }}>
                  <CheckCircle2 size={15} color="#059669" />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#756c5e" }}>
                    Direct Bank Deposits
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* Right Column: OtpForm Card (max-w-md, unified across mobile and desktop) */}
          <View style={{ flex: 1, maxWidth: 448, width: "100%", marginHorizontal: "auto" }}>
            <Card
              className="w-full overflow-hidden rounded-3xl border border-line-strong bg-white p-0 shadow-xl"
              style={{
                boxShadow: "0 16px 40px rgba(0, 17, 46, 0.12)",
                shadowColor: "rgba(0, 17, 46, 0.15)",
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 1,
                shadowRadius: 28,
                elevation: 10,
              }}
            >
              {/* Navy Header Banner with subtle ambient glow and pill badge */}
              <View className="relative overflow-hidden bg-[#00112e] px-6 py-7">
                {/* Ambient Orange Glow in Top Right */}
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    right: -30,
                    top: -30,
                    width: 160,
                    height: 160,
                    borderRadius: 80,
                    backgroundColor: "rgba(248, 112, 0, 0.12)",
                  }}
                />

                <View className="self-start rounded-full border border-white/10 bg-white/10 px-2.5 py-0.5 mb-3">
                  <Text className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300">
                    PARTNER SIGN IN
                  </Text>
                </View>

                <Text className="text-2xl font-extrabold tracking-tight text-white">
                  Welcome back
                </Text>
                <Text className="mt-1.5 text-sm text-slate-300 leading-relaxed">
                  {flow.phase === "code"
                    ? "We will send a 6-digit code by SMS."
                    : "Sign in with the mobile number you registered with to see your account and job offers."}
                </Text>
              </View>

              {/* Form Body */}
              <View className="p-6 sm:p-7">
                <OtpForm
                  {...flow}
                  heading={flow.phase === "code" ? "Enter verification code" : "Your mobile number"}
                  verifyLabel={flow.phase === "code" ? "Verify & Continue" : "Send code"}
                  footer={
                    <View className="mt-4 rounded-2xl border border-line bg-surface-sunken p-4 gap-1">
                      <Text className="text-sm font-bold text-navy-900">New to V Solve Hub?</Text>
                      <Text className="text-xs text-text-muted leading-relaxed">
                        Takes only 5 minutes. Free to join with weekly payouts.
                      </Text>
                      <Pressable
                        accessibilityRole="link"
                        onPress={() => router.push("/apply")}
                        className="mt-1.5 self-start"
                      >
                        <Text
                          className="text-xs font-bold text-signal-700 underline"
                          style={{ textDecorationLine: "underline" }}
                        >
                          Register as a new Partner
                        </Text>
                      </Pressable>
                    </View>
                  }
                />
              </View>
            </Card>

            {/* Helpdesk Contact Link Below Card (Navigates in the SAME TAB) */}
            <Pressable cssInterop={false}
              accessibilityRole="link"
              accessibilityLabel="Partner Helpdesk Contact"
              onPress={() => router.push("/contact")}
              style={({ pressed }) => ({
                marginTop: 20,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                columnGap: 6,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <HelpCircle size={15} color="#756c5e" />
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#756c5e" }}>
                Need help with your phone number or OTP?
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
