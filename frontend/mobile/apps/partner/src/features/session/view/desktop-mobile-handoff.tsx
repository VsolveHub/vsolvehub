// Ported faithfully from frontend/apps/partner/features/session/view/desktop-mobile-handoff.tsx
// 100% accurate UI, styling, badges, SVG QR code, and desktop-only policy.

import type { Schemas } from "@vsolve/api-client";
import { useMobileLogout } from "@vsolve/mobile-core";
import { Logo, Text } from "@vsolve/mobile-ui";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  LogOut,
  QrCode,
  ShieldCheck,
  Smartphone,
  User,
} from "lucide-react-native";
import { Platform, Pressable, ScrollView, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

interface DesktopMobileHandoffProps {
  application?: Schemas["PartnerApplication"] | null;
  phone?: string | null;
  name?: string | null;
}

export function DesktopMobileHandoff({
  application,
  phone,
  name,
}: DesktopMobileHandoffProps) {
  const router = useRouter();
  const signOut = useMobileLogout();
  const partnerName = name || application?.display_name || "Partner";
  const partnerPhone = phone || "Registered Phone";
  const track = application?.track;

  const trackLabel =
    track === "SERVICES"
      ? "Services & Skilled Trades"
      : track === "RENTAL_OWNER"
      ? "Equipment & Tool Rentals"
      : track === "STAY_HOST"
      ? "Accommodation & Stays"
      : "Services & Skilled Trades";

  const initial = (partnerName.trim().charAt(0) || "P").toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: "#020b18", width: "100%", minHeight: "100%", position: "relative", overflow: "hidden" }}>
      {/* Background ambient radial glow */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 60,
          right: 80,
          width: 500,
          height: 500,
          borderRadius: 250,
          backgroundColor: "rgba(6, 182, 212, 0.08)",
          ...(Platform.OS === "web" ? ({ filter: "blur(90px)" } as any) : {}),
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: 40,
          left: 40,
          width: 440,
          height: 440,
          borderRadius: 220,
          backgroundColor: "rgba(245, 158, 11, 0.06)",
          ...(Platform.OS === "web" ? ({ filter: "blur(90px)" } as any) : {}),
        }}
      />

      {/* Top Desktop Navigation */}
      <View
        style={{
          borderBottomWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.1)",
          backgroundColor: "rgba(0, 17, 46, 0.85)",
          width: "100%",
          zIndex: 20,
          ...(Platform.OS === "web" ? ({ backdropFilter: "blur(20px)" } as any) : {}),
        }}
      >
        <View
          style={{
            maxWidth: 1280,
            width: "100%",
            marginHorizontal: "auto",
            height: 64,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 24,
          }}
        >
          {/* Logo & Approved Badge */}
          <View style={{ flexDirection: "row", alignItems: "center", columnGap: 16 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/apply/documents")}
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              <Logo dark />
            </Pressable>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                columnGap: 6,
                borderRadius: 9999,
                borderWidth: 1,
                borderColor: "rgba(16, 185, 129, 0.3)",
                backgroundColor: "rgba(16, 185, 129, 0.1)",
                paddingHorizontal: 12,
                paddingVertical: 4,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 9999,
                  backgroundColor: "#34d399",
                }}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: "#34d399",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
              >
                Registration Approved • Mobile Portal Active
              </Text>
            </View>
          </View>

          {/* Right Action Buttons */}
          <View style={{ flexDirection: "row", alignItems: "center", columnGap: 12 }}>
            <Pressable cssInterop={false}
              accessibilityRole="button"
              accessibilityLabel="Application & Documents"
              onPress={() => router.push("/apply/documents")}
              style={({ pressed }) => ({
                height: 36,
                paddingHorizontal: 16,
                borderRadius: 9999,
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.15)",
                backgroundColor: pressed ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.05)",
                flexDirection: "row",
                alignItems: "center",
                columnGap: 6,
              })}
            >
              <FileCheck2 size={14} color="#34d399" />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: "#ffffff",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
              >
                Application & Documents
              </Text>
            </Pressable>

            <Pressable cssInterop={false}
              accessibilityRole="button"
              accessibilityLabel="Sign Out"
              onPress={() => void signOut()}
              style={({ pressed }) => ({
                height: 36,
                paddingHorizontal: 16,
                borderRadius: 9999,
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.15)",
                backgroundColor: pressed ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.05)",
                flexDirection: "row",
                alignItems: "center",
                columnGap: 6,
              })}
            >
              <LogOut size={14} color="#cbd5e1" />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: "#cbd5e1",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
              >
                Sign Out
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Main Content Area */}
      <ScrollView
        contentContainerStyle={{
          maxWidth: 1280,
          width: "100%",
          marginHorizontal: "auto",
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: 24,
          paddingVertical: 48,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            columnGap: 48,
            width: "100%",
          }}
        >
          {/* Left Column: Partner Status & Mobile Notice */}
          <View style={{ flex: 1.25, maxWidth: 640, rowGap: 24 }}>
            {/* Top Badges */}
            <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  columnGap: 5,
                  borderRadius: 9999,
                  borderWidth: 1,
                  borderColor: "rgba(251, 191, 36, 0.3)",
                  backgroundColor: "rgba(251, 191, 36, 0.1)",
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                }}
              >
                <Smartphone size={13} color="#fcd34d" />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "900",
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    color: "#fcd34d",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                  }}
                >
                  Mobile-Only Partner App
                </Text>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  columnGap: 5,
                  borderRadius: 9999,
                  borderWidth: 1,
                  borderColor: "rgba(52, 211, 153, 0.3)",
                  backgroundColor: "rgba(52, 211, 153, 0.1)",
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                }}
              >
                <CheckCircle2 size={13} color="#6ee7b7" />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: "#6ee7b7",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                  }}
                >
                  Desktop Registration Complete
                </Text>
              </View>
            </View>

            {/* Headline & Description */}
            <View style={{ rowGap: 12 }}>
              <Text
                style={{
                  fontSize: 44,
                  fontWeight: "900",
                  letterSpacing: -0.8,
                  lineHeight: 52,
                  color: "#ffffff",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
              >
                Partner Work & Dispatches are{"\n"}
                <Text
                  style={{
                    color: "#fcd34d",
                    ...(Platform.OS === "web"
                      ? ({
                          backgroundImage: "linear-gradient(to right, #fcd34d, #6ee7b7, #67e8f9)",
                          WebkitBackgroundImage: "linear-gradient(to right, #fcd34d, #6ee7b7, #67e8f9)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                        } as any)
                      : {}),
                  }}
                >
                  Mobile-Only
                </Text>
              </Text>

              <Text
                style={{
                  fontSize: 16,
                  lineHeight: 26,
                  color: "#cbd5e1",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
              >
                Your registration and KYC verification are completed. Daily operations—including live dispatches, real-time navigation, job acceptance, customer calls, and instant payouts—operate exclusively through the VSOLVE Partner Mobile App.
              </Text>
            </View>

            {/* Verified Partner Card */}
            <View
              style={{
                borderRadius: 24,
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.1)",
                backgroundColor: "rgba(255, 255, 255, 0.04)",
                padding: 24,
                rowGap: 20,
                ...(Platform.OS === "web"
                  ? ({
                      backdropFilter: "blur(16px)",
                      boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
                    } as any)
                  : {}),
              }}
            >
              {/* Partner Card Top Row */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  borderBottomWidth: 1,
                  borderColor: "rgba(255, 255, 255, 0.1)",
                  paddingBottom: 18,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", columnGap: 14 }}>
                  <LinearGradient
                    colors={["#3b82f6", "#06b6d4"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 16,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 20, fontWeight: "800", color: "#ffffff" }}>
                      {initial}
                    </Text>
                  </LinearGradient>

                  <View style={{ rowGap: 3 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "700",
                          color: "#ffffff",
                          fontFamily: "system-ui, -apple-system, sans-serif",
                        }}
                      >
                        {partnerName}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          columnGap: 4,
                          borderRadius: 9999,
                          borderWidth: 1,
                          borderColor: "rgba(16, 185, 129, 0.4)",
                          backgroundColor: "rgba(16, 185, 129, 0.2)",
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        <ShieldCheck size={11} color="#6ee7b7" />
                        <Text style={{ fontSize: 10, fontWeight: "800", color: "#6ee7b7" }}>
                          Verified
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 12, color: "#94a3b8" }}>{partnerPhone}</Text>
                  </View>
                </View>

                <View style={{ alignItems: "flex-end", rowGap: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: "500", color: "#94a3b8" }}>
                    Trade Category
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#fcd34d" }}>
                    {trackLabel}
                  </Text>
                </View>
              </View>

              {/* 3 Status Columns */}
              <View style={{ flexDirection: "row", columnGap: 12 }}>
                <View
                  style={{
                    flex: 1,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "rgba(255, 255, 255, 0.05)",
                    backgroundColor: "rgba(255, 255, 255, 0.03)",
                    padding: 12,
                    alignItems: "center",
                    rowGap: 4,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "700", textTransform: "uppercase", color: "#94a3b8" }}>
                    Onboarding
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: "900", color: "#34d399" }}>
                    Approved
                  </Text>
                </View>

                <View
                  style={{
                    flex: 1,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "rgba(255, 255, 255, 0.05)",
                    backgroundColor: "rgba(255, 255, 255, 0.03)",
                    padding: 12,
                    alignItems: "center",
                    rowGap: 4,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "700", textTransform: "uppercase", color: "#94a3b8" }}>
                    Documents
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: "900", color: "#ffffff" }}>
                    KYC Verified
                  </Text>
                </View>

                <View
                  style={{
                    flex: 1,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "rgba(255, 255, 255, 0.05)",
                    backgroundColor: "rgba(255, 255, 255, 0.03)",
                    padding: 12,
                    alignItems: "center",
                    rowGap: 4,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "700", textTransform: "uppercase", color: "#94a3b8" }}>
                    Dispatch Radar
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: "900", color: "#22d3ee" }}>
                    Mobile App Ready
                  </Text>
                </View>
              </View>

              {/* Bottom Profile Links */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  rowGap: 10,
                  paddingTop: 4,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", columnGap: 16 }}>
                  <Pressable
                    onPress={() => router.push("/me/profile" as any)}
                    style={{ flexDirection: "row", alignItems: "center", columnGap: 6 }}
                  >
                    <User size={14} color="#6ee7b7" />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#6ee7b7" }}>
                      View Partner Profile →
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => router.push("/apply/documents" as any)}
                    style={{ flexDirection: "row", alignItems: "center", columnGap: 6 }}
                  >
                    <FileText size={14} color="#fcd34d" />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#fcd34d" }}>
                      Review Registered Documents & Agreements →
                    </Text>
                  </Pressable>
                </View>

                <Text style={{ fontSize: 11, color: "#94a3b8" }}>
                  Desktop view is restricted to registration, profile & documents.
                </Text>
              </View>
            </View>
          </View>

          {/* Right Column: QR Code & App Download Card */}
          <View style={{ flex: 1, maxWidth: 420 }}>
            <View
              style={{
                width: "100%",
                borderRadius: 28,
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.15)",
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                padding: 32,
                alignItems: "center",
                position: "relative",
                overflow: "hidden",
                ...(Platform.OS === "web"
                  ? ({
                      backdropFilter: "blur(24px)",
                      boxShadow: "0 24px 64px rgba(0, 0, 0, 0.6)",
                    } as any)
                  : {}),
              }}
            >
              {/* Internal card ambient radial glows */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  right: -40,
                  top: -40,
                  width: 180,
                  height: 180,
                  borderRadius: 90,
                  backgroundColor: "rgba(6, 182, 212, 0.18)",
                  ...(Platform.OS === "web" ? ({ filter: "blur(40px)" } as any) : {}),
                }}
              />
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: -40,
                  bottom: -40,
                  width: 180,
                  height: 180,
                  borderRadius: 90,
                  backgroundColor: "rgba(245, 158, 11, 0.14)",
                  ...(Platform.OS === "web" ? ({ filter: "blur(40px)" } as any) : {}),
                }}
              />

              {/* QR Icon in circle */}
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "rgba(255, 255, 255, 0.15)",
                  backgroundColor: "rgba(255, 255, 255, 0.1)",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                  zIndex: 2,
                }}
              >
                <QrCode size={24} color="#fcd34d" />
              </View>

              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "900",
                  color: "#ffffff",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  zIndex: 2,
                }}
              >
                Scan to Open on Mobile
              </Text>

              <Text
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  lineHeight: 18,
                  textAlign: "center",
                  color: "#cbd5e1",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  maxWidth: 300,
                  zIndex: 2,
                }}
              >
                Scan this QR code with your phone camera to download the VSOLVE Partner App or open directly on your mobile browser.
              </Text>

              {/* Styled SVG QR Code */}
              <View
                style={{
                  marginVertical: 24,
                  borderRadius: 16,
                  borderWidth: 4,
                  borderColor: "#ffffff",
                  backgroundColor: "#ffffff",
                  padding: 16,
                  zIndex: 2,
                  ...(Platform.OS === "web"
                    ? ({
                        boxShadow: "0 10px 25px rgba(0, 0, 0, 0.3)",
                      } as any)
                    : {}),
                }}
              >
                <Svg viewBox="0 0 160 160" width={160} height={160}>
                  {/* Corner Position Detection Patterns */}
                  <Rect x="10" y="10" width="40" height="40" fill="#00112e" rx="6" />
                  <Rect x="16" y="16" width="28" height="28" fill="#ffffff" rx="4" />
                  <Rect x="22" y="22" width="16" height="16" fill="#00112e" rx="2" />

                  <Rect x="110" y="10" width="40" height="40" fill="#00112e" rx="6" />
                  <Rect x="116" y="16" width="28" height="28" fill="#ffffff" rx="4" />
                  <Rect x="122" y="22" width="16" height="16" fill="#00112e" rx="2" />

                  <Rect x="10" y="110" width="40" height="40" fill="#00112e" rx="6" />
                  <Rect x="16" y="116" width="28" height="28" fill="#ffffff" rx="4" />
                  <Rect x="22" y="122" width="16" height="16" fill="#00112e" rx="2" />

                  {/* Data Matrix Dots simulation */}
                  <Rect x="58" y="15" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="74" y="15" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="90" y="15" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="58" y="32" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="74" y="32" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="90" y="32" width="8" height="8" fill="#00112e" rx="1.5" />

                  <Rect x="15" y="58" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="32" y="58" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="58" y="58" width="14" height="14" fill="#f59e0b" rx="3" />
                  <Rect x="80" y="58" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="96" y="58" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="112" y="58" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="128" y="58" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="144" y="58" width="8" height="8" fill="#00112e" rx="1.5" />

                  <Rect x="15" y="74" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="32" y="74" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="80" y="74" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="104" y="74" width="16" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="128" y="74" width="8" height="8" fill="#00112e" rx="1.5" />

                  <Rect x="15" y="90" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="32" y="90" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="58" y="80" width="8" height="18" fill="#00112e" rx="1.5" />
                  <Rect x="74" y="90" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="90" y="90" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="112" y="90" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="136" y="90" width="8" height="8" fill="#00112e" rx="1.5" />

                  <Rect x="58" y="112" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="74" y="112" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="90" y="112" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="106" y="112" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="122" y="112" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="138" y="112" width="8" height="8" fill="#00112e" rx="1.5" />

                  <Rect x="58" y="128" width="16" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="82" y="128" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="98" y="128" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="114" y="128" width="16" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="138" y="128" width="8" height="8" fill="#00112e" rx="1.5" />

                  <Rect x="58" y="144" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="74" y="144" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="90" y="144" width="16" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="114" y="144" width="8" height="8" fill="#00112e" rx="1.5" />
                  <Rect x="130" y="144" width="16" height="8" fill="#00112e" rx="1.5" />
                </Svg>
              </View>

              {/* App Store / Google Play Buttons */}
              <View style={{ width: "100%", rowGap: 10, zIndex: 2 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    columnGap: 8,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "rgba(255, 255, 255, 0.1)",
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                  }}
                >
                  <Download size={15} color="#34d399" />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#ffffff" }}>
                    Android APK / Google Play
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    columnGap: 8,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "rgba(255, 255, 255, 0.1)",
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                  }}
                >
                  <Download size={15} color="#38bdf8" />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#ffffff" }}>
                    iOS App Store (TestFlight)
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", columnGap: 6, marginTop: 20, zIndex: 2 }}>
                <View style={{ width: 6, height: 6, borderRadius: 9999, backgroundColor: "#34d399" }} />
                <Text style={{ fontSize: 11, fontWeight: "500", color: "#94a3b8" }}>
                  Compatible with Android 10+ and iOS 15+
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
