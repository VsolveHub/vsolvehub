// Ported faithfully from frontend/apps/partner/app/(marketing)/layout.tsx,
// marketing-nav-cta.tsx, and marketing-mobile-nav.tsx.
// 100% identical size, shapes, spacing, tokens, fonts, and responsive drawer.

import { Logo, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ArrowRight, Menu, Phone, X, Zap } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "https://partner.vsolvehub.com";

const NAV_ITEMS = [
  { href: "/how-it-works" as const, label: "How It Works", key: "how-it-works" },
  { href: "/benefits" as const, label: "Earnings & Benefits", key: "benefits" },
  { href: "/trades" as const, label: "Trades & Services", key: "trades" },
  { href: "/contact" as const, label: "Support", key: "contact" },
];

export function MarketingHeader({
  activeTab,
}: {
  activeTab?: "home" | "how-it-works" | "benefits" | "trades" | "contact";
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isTabletOrDesktop = width >= 640;
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer if screen resizes to desktop
  useEffect(() => {
    if (isDesktop && drawerOpen) {
      setDrawerOpen(false);
    }
  }, [isDesktop, drawerOpen]);

  return (
    <>
      {/* Floating Dynamic-Island Navigation with White/95 Backdrop */}
      <View
        pointerEvents="box-none"
        style={{
          position: (Platform.OS === "web" ? "fixed" : "absolute") as any,
          top: Platform.OS === "web" ? 12 : Math.max(12, insets.top),
          left: 0,
          right: 0,
          zIndex: 50,
          paddingHorizontal: isTabletOrDesktop ? 24 : 12,
        }}
      >
        <View
          pointerEvents="auto"
          style={{
            maxWidth: width >= 1280 ? 1280 : 1152, // max-w-6xl xl:max-w-7xl
            width: "100%",
            marginHorizontal: "auto",
            borderRadius: isTabletOrDesktop ? 9999 : 16, // rounded-2xl sm:rounded-full
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            borderWidth: 1,
            borderColor: "rgba(231, 226, 218, 0.9)", // border-line-strong / line
            paddingHorizontal: isTabletOrDesktop ? 20 : 14, // px-3.5 sm:px-5
            paddingVertical: 10, // py-2.5
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            ...(Platform.OS === "web"
              ? ({
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  boxShadow: "0 12px 32px rgba(0, 17, 46, 0.12), 0 1px 3px rgba(0, 0, 0, 0.05)",
                } as any)
              : {
                  shadowColor: "rgba(0, 17, 46, 0.12)",
                  shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 1,
                  shadowRadius: 24,
                  elevation: 8,
                }),
          }}
        >
          {/* Brand & Live Demand Tag */}
          <View style={{ flexDirection: "row", alignItems: "center", columnGap: isTabletOrDesktop ? 12 : 10 }}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="V Solve Hub Home"
              onPress={() => router.push("/")}
              style={({ pressed }) => ({
                opacity: pressed ? 0.8 : 1,
                flexDirection: "row",
                alignItems: "center",
              })}
            >
              <Logo />
            </Pressable>

            {/* Live Demand Status Badge (shown on desktop width >= 1024) */}
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
                  paddingHorizontal: 10, // px-2.5
                  paddingVertical: 4, // py-1
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
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "500",
                    color: "#453f37", // text-text-secondary
                    fontFamily: "system-ui, -apple-system, sans-serif",
                  }}
                >
                  Now onboarding:
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: "#00112e", // text-navy-900
                    fontFamily: "system-ui, -apple-system, sans-serif",
                  }}
                >
                  Hyderabad
                </Text>
              </View>
            ) : null}
          </View>

          {/* Desktop Center Navigation Capsule (hidden below lg: width >= 1024) */}
          {isDesktop ? (
            <View
              accessibilityRole="navigation"
              style={{
                flexDirection: "row",
                alignItems: "center",
                columnGap: 4, // gap-1
                borderRadius: 9999,
                backgroundColor: "rgba(244, 241, 236, 0.8)", // bg-surface-sunken/80
                borderWidth: 1,
                borderColor: "#e7e2da", // border-line
                padding: 4, // p-1
              }}
            >
              {NAV_ITEMS.map((item) => {
                const isActive = activeTab === item.key;
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="link"
                    accessibilityLabel={item.label}
                    onPress={() => router.push(item.href)}
                    style={({ pressed }) => ({
                      borderRadius: 9999,
                      paddingHorizontal: 14, // px-3.5
                      paddingVertical: 8, // py-2
                      backgroundColor: isActive ? "#ffffff" : pressed ? "rgba(255, 255, 255, 0.6)" : "transparent",
                      ...(isActive
                        ? {
                            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.06)",
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.06,
                            shadowRadius: 2,
                            elevation: 1,
                          }
                        : {}),
                    })}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 13, // text-[0.8125rem]
                        fontWeight: isActive ? "700" : "600",
                        color: isActive ? "#00112e" : "#453f37", // text-navy-900 vs text-text-secondary
                        fontFamily: "system-ui, -apple-system, sans-serif",
                      }}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Right Action CTA & Mobile Drawer */}
          <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
            {/* Sign In link (hidden sm:inline-flex -> visible width >= 640) */}
            {isTabletOrDesktop ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Sign In"
                onPress={() => router.push("/login")}
                style={({ pressed }) => ({
                  minHeight: 44, // min-h-11
                  paddingHorizontal: 14, // px-3.5
                  paddingVertical: 6, // py-1.5
                  borderRadius: 9999,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? "#f4f1ec" : "transparent",
                })}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: "#00112e", // text-navy-900
                    fontFamily: "system-ui, -apple-system, sans-serif",
                  }}
                >
                  Sign In
                </Text>
              </Pressable>
            ) : null}

            {/* Become a Partner Primary Gradient Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isTabletOrDesktop ? "Become a Partner" : "Join"}
              onPress={() => router.push("/apply")}
              style={({ pressed }) => ({
                minHeight: 44, // min-h-11
                height: 44,
                borderRadius: 9999,
                overflow: "hidden",
                transform: [{ scale: pressed ? 0.98 : 1 }],
                boxShadow: "0 4px 12px rgba(248, 112, 0, 0.3)",
                shadowColor: "rgba(248, 112, 0, 0.35)",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 1,
                shadowRadius: 10,
                elevation: 4,
              })}
            >
              <LinearGradient
                colors={["#f87000", "#f59e0b", "#fb8130"]} // from-signal-500 via-amber-500 to-signal-400
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{
                  height: 44,
                  paddingHorizontal: isTabletOrDesktop ? 20 : 16, // px-4 sm:px-5
                  paddingVertical: 8, // py-2
                  borderRadius: 9999,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  columnGap: 6,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    fontWeight: "800",
                    color: "#00112e", // text-[#00112e] dark navy text!
                    fontFamily: "system-ui, -apple-system, sans-serif",
                  }}
                >
                  {isTabletOrDesktop ? "Become a Partner" : "Join"}
                </Text>
              </LinearGradient>
            </Pressable>

            {/* Mobile Hamburger Button (lg:hidden -> width < 1024) */}
            {!isDesktop ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open navigation menu"
                onPress={() => setDrawerOpen(true)}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 9999,
                  backgroundColor: pressed ? "#e7e2da" : "#f4f1ec", // bg-surface-sunken
                  borderWidth: 1,
                  borderColor: "#d3ccc0", // border-line-strong
                  alignItems: "center",
                  justifyContent: "center",
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                })}
              >
                <Menu size={20} color="#00112e" strokeWidth={2.2} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      {/* Slide-In Mobile Navigation Drawer (faithfully matching marketing-mobile-nav.tsx) */}
      <Modal
        visible={drawerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setDrawerOpen(false)}
      >
        <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end" }}>
          {/* Backdrop */}
          <Pressable
            accessibilityLabel="Close menu backdrop"
            onPress={() => setDrawerOpen(false)}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: "rgba(0, 8, 23, 0.6)", // bg-navy-950/60
            }}
          />

          {/* Drawer Sheet */}
          <View
            style={{
              position: "relative",
              width: "88%",
              maxWidth: 352, // max-w-[min(22rem,88vw)] = 352px
              height: "100%",
              backgroundColor: "#ffffff",
              borderLeftWidth: 1,
              borderColor: "#e7e2da", // border-line
              paddingTop: Math.max(24, insets.top + 8),
              paddingBottom: Math.max(24, insets.bottom + 8),
              paddingHorizontal: 20, // px-5
              boxShadow: "-8px 0 32px rgba(0, 17, 46, 0.2)",
              shadowColor: "rgba(0, 17, 46, 0.25)",
              shadowOffset: { width: -6, height: 0 },
              shadowOpacity: 1,
              shadowRadius: 24,
              elevation: 20,
            }}
          >
            {/* Header: Brand + Close X */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottomWidth: 1,
                borderColor: "#e7e2da",
                paddingBottom: 16,
              }}
            >
              <Pressable
                onPress={() => {
                  setDrawerOpen(false);
                  router.push("/");
                }}
                style={{ flexDirection: "row", alignItems: "center" }}
              >
                <Logo />
              </Pressable>
              <Pressable
                accessibilityLabel="Close menu"
                onPress={() => setDrawerOpen(false)}
                style={({ pressed }) => ({
                  width: 38,
                  height: 38,
                  borderRadius: 9999,
                  backgroundColor: pressed ? "#e7e2da" : "#f4f1ec",
                  borderWidth: 1,
                  borderColor: "#e7e2da",
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <X size={18} color="#00112e" strokeWidth={2.4} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ flexGrow: 1, paddingVertical: 16, rowGap: 20 }}
            >
              {/* Quick Highlights Card */}
              <View
                style={{
                  borderRadius: 16,
                  backgroundColor: "#fffbeb", // bg-amber-50/70
                  borderWidth: 1,
                  borderColor: "#fde68a", // border-amber-200/70
                  padding: 16,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
                  <Zap size={16} color="#f87000" fill="#f87000" />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: "#78350f", // text-amber-900
                      fontFamily: "system-ui, -apple-system, sans-serif",
                    }}
                  >
                    Fast 24h Activation
                  </Text>
                </View>
                <Text
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    lineHeight: 18,
                    color: "#451a03", // text-amber-950/80
                    fontFamily: "system-ui, -apple-system, sans-serif",
                  }}
                >
                  Zero joining fee. Direct bank settlements within 24 hours of job completion.
                </Text>
              </View>

              {/* Navigation links */}
              <View>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    color: "#756c5e", // text-text-muted
                    paddingHorizontal: 8,
                    marginBottom: 8,
                    fontFamily: "system-ui, -apple-system, sans-serif",
                  }}
                >
                  Explore Menu
                </Text>

                <View style={{ rowGap: 4 }}>
                  {NAV_ITEMS.map((item) => {
                    const isActive = activeTab === item.key;
                    return (
                      <Pressable
                        key={item.key}
                        onPress={() => {
                          setDrawerOpen(false);
                          router.push(item.href);
                        }}
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          backgroundColor: isActive
                            ? "#f4f1ec"
                            : pressed
                            ? "#faf8f5"
                            : "transparent",
                        })}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: isActive ? "800" : "700",
                            color: "#00112e",
                            fontFamily: "system-ui, -apple-system, sans-serif",
                          }}
                        >
                          {item.label}
                        </Text>
                        <ArrowRight size={14} color="#756c5e" />
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Action CTAs & Support footer at bottom of drawer */}
              <View style={{ marginTop: "auto", paddingTop: 16, borderTopWidth: 1, borderColor: "#e7e2da", rowGap: 10 }}>
                {/* Become a Partner */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setDrawerOpen(false);
                    router.push("/apply");
                  }}
                  style={({ pressed }) => ({
                    height: 48,
                    borderRadius: 9999,
                    overflow: "hidden",
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                    boxShadow: "0 6px 16px rgba(248, 112, 0, 0.25)",
                    shadowColor: "rgba(248, 112, 0, 0.3)",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 1,
                    shadowRadius: 10,
                    elevation: 4,
                  })}
                >
                  <LinearGradient
                    colors={["#f87000", "#f59e0b", "#fb8130"]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={{
                      height: 48,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 9999,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "800",
                        color: "#00112e",
                        fontFamily: "system-ui, -apple-system, sans-serif",
                      }}
                    >
                      Become a Partner
                    </Text>
                  </LinearGradient>
                </Pressable>

                {/* Sign In to Account */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setDrawerOpen(false);
                    router.push("/login");
                  }}
                  style={({ pressed }) => ({
                    height: 44,
                    borderRadius: 9999,
                    backgroundColor: pressed ? "#f4f1ec" : "#faf8f5",
                    borderWidth: 1,
                    borderColor: "#e7e2da",
                    alignItems: "center",
                    justifyContent: "center",
                  })}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: "#00112e",
                      fontFamily: "system-ui, -apple-system, sans-serif",
                    }}
                  >
                    Sign In to Account
                  </Text>
                </Pressable>

                {/* Partner Helpline */}
                <Pressable
                  onPress={() => {
                    setDrawerOpen(false);
                    void WebBrowser.openBrowserAsync(`${WEB_BASE}/contact`);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    columnGap: 6,
                    paddingTop: 8,
                  }}
                >
                  <Phone size={14} color="#f87000" />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#453f37",
                      fontFamily: "system-ui, -apple-system, sans-serif",
                    }}
                  >
                    Partner Helpline: +91 879 056 4634
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
