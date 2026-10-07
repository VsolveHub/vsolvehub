// Ported from frontend/apps/partner/features/session/view/login-screen.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { safeNextPath } from "@vsolve/query/native";
import { useAuthStore, useMobileOtpFlow } from "@vsolve/mobile-core";
import { Card, Logo, OtpForm, Text } from "@vsolve/mobile-ui";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
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
              <View className="mt-4 rounded-2xl border border-line bg-surface-sunken p-4">
                <Text className="text-xs leading-relaxed text-text">
                  <Text className="font-bold text-navy-900">New to V Solve Hub? </Text>
                  <Text
                    onPress={() => router.push("/apply")}
                    className="font-bold text-signal-700 underline"
                    style={{ textDecorationLine: "underline" }}
                  >
                    Register as a New Partner
                  </Text>
                </Text>
                <Text className="mt-1 text-[11px] text-text-muted">
                  Takes only 5 minutes. Free to join with weekly payouts.
                </Text>
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
