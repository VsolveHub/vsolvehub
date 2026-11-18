import type { MobileOtpFlow } from "@vsolve/mobile-core";
import { OtpForm, Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { HelpCircle } from "lucide-react-native";
import { useCallback, useEffect, useRef, type ComponentRef, type ReactNode } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const HERO = require("../../../../assets/images/login-hero.png");
// Height / width of login-hero.png (1206 × 1305). Keep in step with the file when it changes.
const HERO_ASPECT = 1305 / 1206;
const LOGO_MARK = require("../../../../assets/logo-mark.png");
// The photo's own white background, so the area around it blends in.
const HERO_BG = "#ffffff";
const LOGO_TOP_GAP = 12;
const LOGO_PILL_HEIGHT = 34;

export function MobileLogin({
  flow,
  footer,
  onHelp,
}: {
  flow: MobileOtpFlow;
  footer: ReactNode;
  onHelp: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const cardY = useRef(0);
  const headerHeight = insets.top + LOGO_TOP_GAP + LOGO_PILL_HEIGHT + 8;

  const scrollCardIntoView = useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.max(0, cardY.current - headerHeight), animated: true });
  }, [headerHeight]);
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", scrollCardIntoView);
    return () => sub.remove();
  }, [scrollCardIntoView]);
  const isCodeStep = flow.phase === "code";

  return (
    <View style={{ flex: 1, backgroundColor: HERO_BG }}>
      <View style={StyleSheet.absoluteFill}>
        {/* Starts below the logo pill, so the pill never covers a face. */}
        <Image
          source={HERO}
          style={{ width, height: Math.round(width * HERO_ASPECT), marginTop: headerHeight }}
          contentFit="cover"
          priority="high"
          accessible={false}
        />
      </View>
      <View
        pointerEvents="none"
        className="bg-canvas"
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "30%" }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ height: headerHeight }} />
          <View style={{ flex: 1, minHeight: 80 }} />

          <View
            className="bg-canvas"
            style={styles.sheet}
            onLayout={(event) => {
              cardY.current = event.nativeEvent.layout.y;
              if (Keyboard.isVisible()) scrollCardIntoView();
            }}
          >
            <View className="px-6 pt-6" style={{ paddingBottom: insets.bottom + 12 }}>
              <OtpForm
                {...flow}
                canRequest={!flow.isRequesting && flow.resendInSeconds === 0}
                className="max-w-none"
                heading={isCodeStep ? "Enter verification code" : "Welcome back"}
                description={
                  isCodeStep
                    ? undefined
                    : "Sign in with the mobile number you registered with to see your account and job offers."
                }
                verifyLabel="Verify & Continue"
                footer={isCodeStep ? undefined : footer}
              />

              <Pressable
                cssInterop={false}
                accessibilityRole="link"
                accessibilityLabel="Partner Helpdesk Contact"
                onPress={onHelp}
                style={({ pressed }) => ({
                  minHeight: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  columnGap: 6,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <HelpCircle size={15} color="#453f37" />
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#453f37" }}>
                  Need help with your phone number or OTP?
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View
        pointerEvents="none"
        className="flex-row items-center gap-1.5 rounded-full bg-white/90 px-2.5"
        style={{ position: "absolute", top: insets.top + LOGO_TOP_GAP, left: 16, height: LOGO_PILL_HEIGHT }}
      >
        <Image source={LOGO_MARK} style={{ width: 22, height: 22 }} contentFit="contain" accessible={false} />
        <Text className="text-[15px] font-extrabold tracking-tight text-navy-900" accessibilityLabel="V Solve Hub">
          V Solve <Text className="text-[#EA580C]">Hub</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    overflow: "hidden",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255, 255, 255, 0.6)",
  },
});
