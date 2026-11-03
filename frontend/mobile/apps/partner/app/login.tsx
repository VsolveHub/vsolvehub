// Ported from frontend/apps/partner/features/session/view/login-screen.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { safeNextPath } from "@vsolve/query/native";
import { useAuthStore, useMobileOtpFlow } from "@vsolve/mobile-core";
import { Card, Logo, OtpForm, Text } from "@vsolve/mobile-ui";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  CheckCircle2,
  HelpCircle,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { usePartnerApplication } from "@/features/application/queries";
import { homeForApplication } from "@/features/session/model/redirect";

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "https://partner.vsolvehub.com";

const NAV_ITEMS = [
  { href: `${WEB_BASE}/how-it-works`, label: "How It Works" },
  { href: `${WEB_BASE}/benefits`, label: "Earnings & Benefits" },
  { href: `${WEB_BASE}/trades`, label: "Trades & Services" },
  { href: `${WEB_BASE}/contact`, label: "Support" },
];

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  const [menuOpen, setMenuOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const status = useAuthStore((state) => state.status);
  const signedIn = status === "signedIn";
  const application = usePartnerApplication({ enabled: signedIn });
  const flow = useMobileOtpFlow({ intendedRole: "partner" });
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const missing = application.error instanceof ApiRequestError && application.error.status === 404;
  const knowsWhereToGo = !application.isPending || missing;

  useEffect(() => {
    if (!signedIn || !knowsWhereToGo) return;
    if (next) {
      router.replace(next as never);
      return;
    }
    router.replace(homeForApplication(missing ? null : (application.data?.status ?? null)));
  }, [application.data?.status, knowsWhereToGo, missing, next, router, signedIn]);

  if (status === "loading" || signedIn) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-text-secondary">
          {signedIn ? "Taking you to your account…" : "Checking your session…"}
        </Text>
      </View>
    );
  }

  if (isDesktop) {
    return <DesktopPartnerLogin flow={flow} router={router} />;
  }

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="items-center px-4 pt-4 pb-12"
      keyboardShouldPersistTaps="handled"
    >
      {/* Floating Dynamic-Island Navigation Header Capsule */}
      <View
        className="mb-6 w-full max-w-md flex-row items-center justify-between rounded-2xl sm:rounded-full border border-line-strong bg-white/95 px-3.5 sm:px-5 py-2.5 shadow-md"
        style={{
          shadowColor: "rgba(0, 17, 46, 0.5)",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.22,
          shadowRadius: 20,
          elevation: 8,
        }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/")}
          className="active:opacity-80"
        >
          <Logo />
        </Pressable>
        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/apply")}
            className="overflow-hidden rounded-full active:scale-[0.98] active:opacity-95"
            style={{
              shadowColor: "#f87000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.35,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <LinearGradient
              colors={["#f87000", "#f59e0b", "#fb923c"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ paddingHorizontal: 16, paddingVertical: 7, borderRadius: 9999 }}
            >
              <Text className="text-xs font-extrabold text-[#00112e]">Join</Text>
            </LinearGradient>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Navigation menu"
            onPress={() => setMenuOpen((prev) => !prev)}
            className="h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-line-strong bg-surface-sunken active:bg-surface-hover shadow-xs"
          >
            <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#00112e" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              {menuOpen ? (
                <Path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <Path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </Svg>
          </Pressable>
        </View>
      </View>

      {/* Dropdown Navigation Menu */}
      {menuOpen ? (
        <View className="mb-6 w-full max-w-md overflow-hidden rounded-2xl border border-line bg-white p-2 shadow-lg">
          {NAV_ITEMS.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              onPress={() => {
                setMenuOpen(false);
                void WebBrowser.openBrowserAsync(item.href);
              }}
              className="rounded-xl px-4 py-3 active:bg-surface-sunken"
            >
              <Text className="text-sm font-semibold text-navy-900">{item.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Main Login Card */}
      <Card className="w-full max-w-md overflow-hidden rounded-3xl border border-line-strong bg-white p-0 shadow-xl">
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
              Partner Sign In
            </Text>
          </View>

          <Text className="text-2xl font-extrabold tracking-tight text-white">
            Welcome Back
          </Text>
          <Text className="mt-1.5 text-xs text-slate-300 leading-relaxed">
            Enter your registered 10-digit mobile number to access your Partner account and job offers.
          </Text>
        </View>

        {/* Form Body */}
        <View className="p-6">
          <OtpForm
            {...flow}
            heading="Your Mobile Number"
            verifyLabel="Verify & Sign In"
            footer={
              <View className="mt-4 rounded-2xl border border-line bg-surface-sunken p-4 gap-1">
                <Text className="text-sm font-bold text-navy-900">New to V Solve Hub?</Text>
                <Text className="text-xs text-text-muted leading-relaxed">
                  Takes only 5 minutes. Free to join with weekly payouts.
                </Text>
                <Pressable onPress={() => router.push("/apply")} className="mt-1.5 self-start">
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

      {/* Helpdesk Contact Link Below Card */}
      <Pressable
        accessibilityRole="button"
        onPress={() => void WebBrowser.openBrowserAsync(`${WEB_BASE}/contact`)}
        className="mt-6 flex-row items-center justify-center gap-1.5 active:opacity-75"
      >
        <Svg
          viewBox="0 0 24 24"
          width={15}
          height={15}
          fill="none"
          stroke="#756c5e"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Circle cx={12} cy={12} r={10} />
          <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <Path d="M12 17h.01" />
        </Svg>
        <Text className="text-xs font-semibold text-text-muted">
          Need help with your phone number or OTP?
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function DesktopPartnerLogin({
  flow,
  router,
}: {
  flow: ReturnType<typeof useMobileOtpFlow>;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <ScrollView
      className="flex-1 bg-[#FAF9F7]"
      contentContainerClassName="px-8 pt-4 pb-16 items-center min-h-screen"
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Floating Dynamic-Island Top Navigation Capsule */}
      <View
        className="w-full max-w-[1100px] flex-row items-center justify-between rounded-full border border-[#EAE8E4] bg-white px-6 py-2.5 shadow-sm mt-2 mb-12"
        style={{
          shadowColor: "rgba(0, 17, 46, 0.08)",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 16,
        }}
      >
        {/* Brand & Demand status pill */}
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="V Solve Hub Partner Home"
            onPress={() => router.push("/")}
            className="cursor-pointer active:opacity-80"
          >
            <Logo />
          </Pressable>

          <View className="flex-row items-center gap-1.5 rounded-full border border-[#E5E0D8] bg-[#F4F1EA] px-3 py-1 ml-2">
            <View className="h-2 w-2 rounded-full bg-emerald-500" />
            <Text className="text-xs font-medium text-slate-500">
              Now onboarding: <Text className="font-bold text-[#0B1B3D]">Hyderabad</Text>
            </Text>
          </View>
        </View>

        {/* Center Nav Capsule */}
        <View className="flex-row items-center gap-1 rounded-full border border-[#E5E0D8] bg-[#F4F1EA] px-2 py-1">
          {NAV_ITEMS.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="link"
              onPress={() => void WebBrowser.openBrowserAsync(item.href)}
              className="cursor-pointer rounded-full px-3.5 py-1.5 active:bg-white hover:bg-white"
            >
              <Text className="text-xs font-semibold text-slate-600 hover:text-[#0B1B3D]">
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Right Action Buttons */}
        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/login")}
            className="cursor-pointer rounded-full px-4 py-2 hover:bg-slate-100"
          >
            <Text className="text-xs font-bold text-[#0B1B3D]">Sign In</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/apply")}
            className="cursor-pointer rounded-full bg-[#EA580C] px-5 py-2.5 active:bg-[#C2410C] shadow-xs"
          >
            <Text className="text-xs font-bold text-white">Become a Partner</Text>
          </Pressable>
        </View>
      </View>

      {/* Main Two-Column Content Grid */}
      <View className="w-full max-w-[1100px] flex-row items-center justify-between gap-12 px-2 my-auto">
        {/* Left Column: Registration Portal Value Prop */}
        <View className="flex-1 max-w-[560px] flex-col gap-6 pr-4">
          {/* Top Badges */}
          <View className="flex-row items-center gap-2.5">
            <View className="flex-row items-center gap-1.5 rounded-full border border-slate-300/80 bg-white px-3.5 py-1.5 shadow-2xs">
              <View className="h-2 w-2 rounded-full bg-emerald-500" />
              <Text className="text-xs font-bold text-[#0B1B3D]">Partner Onboarding Portal</Text>
            </View>
            <View className="flex-row items-center gap-1.5 rounded-full border border-amber-300/80 bg-amber-50/80 px-3.5 py-1.5">
              <Sparkles size={13} color="#D97706" />
              <Text className="text-xs font-bold text-amber-800">Desktop Registration</Text>
            </View>
          </View>

          {/* Heading & Subtitle */}
          <View className="flex-col gap-3">
            <Text className="text-[2.65rem] font-black tracking-tight text-[#0B1B3D] leading-[1.15]">
              Register & Verify as a{"\n"}Partner on Desktop
            </Text>
            <Text className="text-sm text-slate-600 leading-relaxed max-w-[500px]">
              Enter your mobile number to register as a new partner or continue your document verification. Once approved, live dispatches operate exclusively on our Partner Mobile App.
            </Text>
          </View>

          {/* 2 Feature Cards */}
          <View className="flex-row gap-3.5 pt-1">
            <View className="flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs gap-1.5">
              <View className="flex-row items-center gap-2">
                <ShieldCheck size={16} color="#059669" />
                <Text className="text-xs font-bold text-[#0B1B3D]">KYC & Document Review</Text>
              </View>
              <Text className="text-[11.5px] text-slate-500 leading-relaxed">
                Fast 24-hour verification for Government ID, Address Proof & bank accounts.
              </Text>
            </View>

            <View className="flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs gap-1.5">
              <View className="flex-row items-center gap-2">
                <Smartphone size={16} color="#2563EB" />
                <Text className="text-xs font-bold text-[#0B1B3D]">Mobile App Operations</Text>
              </View>
              <Text className="text-[11.5px] text-slate-500 leading-relaxed">
                Daily job requests, turn-by-turn navigation, and customer chat run on phone.
              </Text>
            </View>
          </View>

          {/* Trust Indicators */}
          <View className="flex-row items-center gap-3 pt-1">
            <View className="flex-row items-center gap-1.5">
              <CheckCircle2 size={15} color="#059669" />
              <Text className="text-xs font-semibold text-slate-600">15,000+ Verified Partners</Text>
            </View>
            <Text className="text-slate-400">•</Text>
            <View className="flex-row items-center gap-1.5">
              <CheckCircle2 size={15} color="#059669" />
              <Text className="text-xs font-semibold text-slate-600">Direct Bank Deposits</Text>
            </View>
          </View>
        </View>

        {/* Right Column: Card */}
        <View className="w-[420px] shrink-0 flex-col items-center">
          <Card className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 shadow-xl">
            {/* Dark Navy Header */}
            <View className="relative overflow-hidden bg-[#00112e] px-7 py-7">
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  right: -25,
                  top: -25,
                  width: 140,
                  height: 140,
                  borderRadius: 70,
                  backgroundColor: "rgba(248, 112, 0, 0.12)",
                }}
              />
              <View className="self-start rounded-full border border-white/10 bg-white/10 px-2.5 py-0.5 mb-2.5">
                <Text className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                  PARTNER SIGN IN
                </Text>
              </View>
              <Text className="text-2xl font-extrabold tracking-tight text-white">
                Welcome back
              </Text>
              <Text className="mt-1.5 text-xs text-slate-300 leading-relaxed">
                {flow.phase === "code"
                  ? "Enter the 6-digit verification code sent to your phone."
                  : "Sign in with the mobile number you registered with to see your account and job offers."}
              </Text>
            </View>

            {/* Form Body */}
            <View className="p-7">
              <OtpForm
                {...flow}
                heading={flow.phase === "code" ? "6-digit code" : "Your mobile number"}
                verifyLabel="Verify & Sign In"
                className="w-full max-w-none"
                footer={
                  <View className="mt-4 rounded-2xl border border-[#E5E0D8] bg-[#F4F1EA]/80 p-4 gap-1">
                    <Text className="text-sm font-bold text-[#0B1B3D]">New to V Solve Hub?</Text>
                    <Text className="text-xs text-slate-500 leading-relaxed">
                      Takes only 5 minutes. Free to join with weekly payouts.
                    </Text>
                    <Pressable onPress={() => router.push("/apply")} className="mt-2 self-start cursor-pointer">
                      <Text
                        className="text-xs font-bold text-[#EA580C] underline"
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

          {/* Helpdesk Contact Link Below Card */}
          <Pressable
            accessibilityRole="button"
            onPress={() => void WebBrowser.openBrowserAsync(`${WEB_BASE}/contact`)}
            className="mt-6 flex-row items-center justify-center gap-1.5 active:opacity-75 cursor-pointer"
          >
            <HelpCircle size={15} color="#64748B" />
            <Text className="text-xs font-semibold text-slate-500">
              Need help with your phone number or OTP?
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
