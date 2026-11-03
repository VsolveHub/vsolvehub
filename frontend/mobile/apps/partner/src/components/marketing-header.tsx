import { Logo, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Platform, Pressable, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "https://partner.vsolvehub.com";

export function MarketingHeader({
  activeTab,
}: {
  activeTab?: "home" | "how-it-works" | "benefits" | "trades" | "contact";
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <View className="sticky top-0 z-50 px-3 sm:px-6 pt-3 pb-1.5 pointer-events-none">
      <View
        className={`mx-auto w-full ${
          isDesktop ? "max-w-6xl rounded-full px-5 py-2.5" : "max-w-md rounded-2xl px-4 py-2.5"
        } flex-row items-center justify-between border border-slate-200/90 bg-white/95 shadow-md pointer-events-auto`}
        style={{
          shadowColor: "rgba(0, 17, 46, 0.12)",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 1,
          shadowRadius: 24,
          elevation: 8,
          minHeight: 56,
        }}
      >
        {/* Left: Brand + Onboarding Badge */}
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.push("/")} className="active:opacity-80">
            <Logo />
          </Pressable>
          {isDesktop ? (
            <View className="flex-row items-center gap-2 rounded-full bg-slate-100 border border-slate-200 px-3 py-1 ml-2">
              <View className="h-2 w-2 rounded-full bg-emerald-500" />
              <Text className="text-xs text-slate-500 font-medium">Now onboarding:</Text>
              <Text className="text-xs text-slate-900 font-bold">Hyderabad</Text>
            </View>
          ) : null}
        </View>

        {/* Desktop Center Navigation Capsule */}
        {isDesktop ? (
          <View className="flex-row items-center gap-1 rounded-full bg-slate-100/80 border border-slate-200/80 p-1">
            <Pressable
              onPress={() => router.push("/how-it-works")}
              className={`rounded-full px-4 py-1.5 active:bg-white ${
                activeTab === "how-it-works" ? "bg-white shadow-2xs" : ""
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  activeTab === "how-it-works" ? "text-navy-900 font-bold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                How It Works
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/benefits")}
              className={`rounded-full px-4 py-1.5 active:bg-white ${
                activeTab === "benefits" ? "bg-white shadow-2xs" : ""
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  activeTab === "benefits" ? "text-navy-900 font-bold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Earnings & Benefits
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/trades")}
              className={`rounded-full px-4 py-1.5 active:bg-white ${
                activeTab === "trades" ? "bg-white shadow-2xs" : ""
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  activeTab === "trades" ? "text-navy-900 font-bold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Trades & Services
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/contact")}
              className={`rounded-full px-4 py-1.5 active:bg-white ${
                activeTab === "contact" ? "bg-white shadow-2xs" : ""
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  activeTab === "contact" ? "text-navy-900 font-bold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Support
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Right Action Buttons */}
        <View className="flex-row items-center gap-2">
          {isDesktop ? (
            <Pressable
              onPress={() => router.push("/login")}
              className="px-4 py-2 rounded-full active:bg-slate-100"
            >
              <Text className="text-xs font-bold text-slate-800">Sign In</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/apply")}
            className="overflow-hidden rounded-full active:scale-[0.98] active:opacity-95"
            style={{
              height: 40,
              shadowColor: "rgba(248, 112, 0, 0.35)",
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 1,
              shadowRadius: 6,
              elevation: 4,
            }}
          >
            <LinearGradient
              colors={["#f87000", "#ea580c"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{
                height: 40,
                paddingHorizontal: isDesktop ? 22 : 18,
                borderRadius: 9999,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "800",
                  color: "#ffffff",
                  fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
                }}
              >
                {isDesktop ? "Become a Partner" : "Join"}
              </Text>
            </LinearGradient>
          </Pressable>

          {!isDesktop ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Navigation menu"
              onPress={() => setMenuOpen((prev) => !prev)}
              className="h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 active:bg-slate-100 shadow-xs"
            >
              <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#00112e" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                {menuOpen ? (
                  <Path d="M18 6L6 18M6 6l12 12" />
                ) : (
                  <Path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </Svg>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Mobile Dropdown Navigation Menu */}
      {!isDesktop && menuOpen ? (
        <View className="mx-auto mt-2 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl pointer-events-auto">
          <Pressable
            onPress={() => {
              setMenuOpen(false);
              router.push("/how-it-works");
            }}
            className="rounded-xl px-4 py-2.5 active:bg-slate-50"
          >
            <Text className="text-sm font-semibold text-navy-900">How It Works</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMenuOpen(false);
              router.push("/benefits");
            }}
            className="rounded-xl px-4 py-2.5 active:bg-slate-50"
          >
            <Text className="text-sm font-semibold text-navy-900">Earnings & Benefits</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMenuOpen(false);
              router.push("/trades");
            }}
            className="rounded-xl px-4 py-2.5 active:bg-slate-50"
          >
            <Text className="text-sm font-semibold text-navy-900">Trades & Services</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMenuOpen(false);
              router.push("/contact");
            }}
            className="rounded-xl px-4 py-2.5 active:bg-slate-50"
          >
            <Text className="text-sm font-semibold text-navy-900">Support & Contact</Text>
          </Pressable>
          <View className="my-1.5 border-t border-slate-100" />
          <Pressable
            onPress={() => {
              setMenuOpen(false);
              router.push("/login");
            }}
            className="rounded-xl px-4 py-2.5 bg-slate-50 active:bg-slate-100"
          >
            <Text className="text-sm font-bold text-[#f87000]">Partner Sign In →</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMenuOpen(false);
              router.push("/apply");
            }}
            className="rounded-xl px-4 py-2.5 active:bg-slate-50"
          >
            <Text className="text-sm font-bold text-navy-900">Register as a Partner</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMenuOpen(false);
              void WebBrowser.openBrowserAsync(`${WEB_BASE}/contact`);
            }}
            className="rounded-xl px-4 py-2.5 active:bg-slate-50"
          >
            <Text className="text-sm font-medium text-slate-500">24/7 Support Desk</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

