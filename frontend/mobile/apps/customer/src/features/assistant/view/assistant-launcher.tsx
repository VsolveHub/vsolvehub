import { Text } from "@vsolve/mobile-ui";
import { X } from "lucide-react-native";
import { type ReactNode, useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, View } from "react-native";

import type { AssistantMessage } from "../queries";
import { HelperBot } from "./welcome-hero";

function useReduceMotionAnimated(
  key: number | string,
  duration = 240,
) {
  const [entrance] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!active) return;
      if (reduceMotion) {
        entrance.setValue(1);
        return;
      }
      entrance.setValue(0);
      Animated.timing(entrance, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    return () => {
      active = false;
    };
  }, [duration, entrance, key]);

  return entrance;
}

function FloatingBannerSlot({
  isDesktop,
  desktopBottom,
  bottomOffset,
  triggerKey,
  children,
}: {
  isDesktop: boolean;
  desktopBottom: number;
  bottomOffset: number;
  triggerKey: number | string;
  children: ReactNode;
}) {
  const entrance = useReduceMotionAnimated(triggerKey);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        isDesktop
          ? {
              position: (Platform.OS === "web" ? "fixed" : "absolute") as "absolute",
              right: 96,
              bottom: desktopBottom,
              alignItems: "flex-end",
              zIndex: 40,
            }
          : {
              position: "absolute",
              left: 16,
              right: 16,
              bottom: bottomOffset,
              alignItems: "center",
              justifyContent: "center",
              zIndex: 40,
            },
        {
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
      className="z-40 items-center justify-center"
    >
      {children}
    </Animated.View>
  );
}

function usePulseRingAnimation(active: boolean) {
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return;
    }
    let mounted = true;
    let loop: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!mounted || reduceMotion) return;
      pulse.setValue(0);
      loop = Animated.loop(
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      );
      loop.start();
    });
    return () => {
      mounted = false;
      loop?.stop();
    };
  }, [active, pulse]);

  return pulse;
}

function useIdleFloatAnimation(active: boolean) {
  const [floatAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    let loop: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!mounted || reduceMotion) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(floatAnim, {
            toValue: 1,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(floatAnim, {
            toValue: 0,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
    });
    return () => {
      mounted = false;
      loop?.stop();
    };
  }, [active, floatAnim]);

  return floatAnim;
}

function UnreadAlertOverlays({ unreadCount }: { unreadCount: number }) {
  const pulse = usePulseRingAnimation(unreadCount > 0);
  if (unreadCount <= 0) return null;

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 26,
          borderWidth: 2,
          borderColor: "#EA580C",
          opacity: pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.7, 0, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.38] }) }],
        }}
      />
      <View
        style={{
          position: "absolute",
          top: -2,
          right: -2,
          height: 18,
          minWidth: 18,
          borderRadius: 9,
          borderWidth: 2,
          borderColor: "#FAF9F7",
          backgroundColor: "#EA580C",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 4,
          zIndex: 10,
        }}
      >
        <Text style={{ fontSize: 10, fontWeight: "800", lineHeight: 12, color: "#FFFFFF" }}>
          {unreadCount > 9 ? "9+" : unreadCount}
        </Text>
      </View>
    </>
  );
}

/**
 * Option 1 — Elevated Center Orb docked in the middle of the mobile bottom tab bar.
 * Sits in an `h-7` (28px) flow wrapper matching sibling tabs so "Ask AI" aligns cleanly on the baseline.
 */
export function AssistantTabOrb({
  active,
  unreadCount,
  onPress,
}: {
  active: boolean;
  unreadCount: number;
  onPress: () => void;
}) {
  const floatAnim = useIdleFloatAnimation(true);
  const [pressScale] = useState(() => new Animated.Value(1));

  const animatePress = (toValue: number) => {
    Animated.spring(pressScale, {
      toValue,
      friction: 6,
      tension: 180,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={
        unreadCount > 0 ? `Ask AI, ${unreadCount} unread` : "Ask AI"
      }
      hitSlop={{ top: 24, bottom: 4, left: 4, right: 4 }}
      onPress={onPress}
      onPressIn={() => animatePress(0.92)}
      onPressOut={() => animatePress(1)}
      className="min-w-0 flex-1 items-center justify-center gap-1 px-1 py-0.5"
      style={{
        flex: 1,
        minWidth: 0,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 4,
        paddingVertical: 2,
      }}
    >
      <View
        style={{
          position: "relative",
          height: 28,
          width: 56,
          alignItems: "center",
          justifyContent: "center",
          overflow: "visible",
        }}
      >
        {/* Outer Cutout Halo: 52x52 circle matching tab bar background */}
        <View
          style={{
            position: "absolute",
            top: -24,
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: "#FAF9F7",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1.5,
            borderColor: active ? "rgba(234, 88, 12, 0.35)" : "rgba(234, 88, 12, 0.22)",
            overflow: "visible",
          }}
        >
          {/* Inner Elevated Orb: 44x44 warm cream/orange disc */}
          <Animated.View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: "#FFF7ED",
              borderWidth: 2,
              borderColor: active ? "#EA580C" : "rgba(234, 88, 12, 0.45)",
              alignItems: "center",
              justifyContent: "center",
              transform: [{ scale: pressScale }],
              shadowColor: "#EA580C",
              shadowOpacity: active ? 0.3 : 0.18,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 4,
              overflow: "hidden",
            }}
          >
            <Animated.View
              style={{
                alignItems: "center",
                justifyContent: "center",
                transform: [
                  {
                    translateY: floatAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -1.8],
                    }),
                  },
                ],
              }}
            >
              <HelperBot size={30} animated />
            </Animated.View>
          </Animated.View>

          {/* Unread Alert badge on halo so overflow: hidden doesn't clip */}
          <UnreadAlertOverlays unreadCount={active ? 0 : unreadCount} />
        </View>
      </View>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "bold",
          textAlign: "center",
          marginTop: 2,
          color: active ? "#EA580C" : "#00112E",
          lineHeight: 14,
        }}
      >
        Ask AI
      </Text>
    </Pressable>
  );
}

/** Floating circular HelperBot launcher shown on desktop viewports in the customer portal. */
export function FloatingAssistantOrb({
  unreadCount,
  onPress,
}: {
  unreadCount: number;
  onPress: () => void;
}) {
  const floatAnim = useIdleFloatAnimation(true);

  return (
    <Animated.View
      style={{
        position: (Platform.OS === "web" ? "fixed" : "absolute") as "absolute",
        right: 24,
        bottom: 24,
        transform: [
          { translateY: floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
        ],
      }}
      className="z-40"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          unreadCount > 0
            ? `Open the booking assistant, ${unreadCount} unread`
            : "Open the booking assistant"
        }
        onPress={onPress}
        style={{
          position: "relative",
          width: 60,
          height: 60,
          borderRadius: 30,
          borderWidth: 1.5,
          borderColor: "rgba(234, 88, 12, 0.35)",
          backgroundColor: "#FFF7ED",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#EA580C",
          shadowOpacity: 0.25,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
        className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
      >
        <UnreadAlertOverlays unreadCount={unreadCount} />
        <HelperBot size={44} animated />
      </Pressable>
    </Animated.View>
  );
}

/** Animated preview card shown above the mobile bar (or beside the desktop orb) when a reply arrives. */
export function ReplyPeekBanner({
  message,
  isDesktop,
  bottomOffset,
  onOpen,
  onDismiss,
}: {
  message: AssistantMessage;
  isDesktop: boolean;
  bottomOffset: number;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <FloatingBannerSlot
      isDesktop={isDesktop}
      desktopBottom={24}
      bottomOffset={bottomOffset}
      triggerKey={message.sequence}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 320,
          alignSelf: "center",
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 10,
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: "rgba(234, 88, 12, 0.35)",
          backgroundColor: "#FFFFFF",
          paddingHorizontal: 14,
          paddingVertical: 10,
          shadowColor: "#00112E",
          shadowOpacity: 0.14,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
        className="w-full max-w-xs flex-row items-start gap-2 rounded-2xl border border-[#EA580C]/35 bg-white shadow-xl"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open booking assistant reply"
          onPress={onOpen}
          style={{ flex: 1, minWidth: 0 }}
          className="min-w-0 flex-1 active:opacity-80"
        >
          <Text style={{ fontSize: 12, fontWeight: "bold", color: "#00112E" }}>
            V Solve Hub AI
          </Text>
          <Text
            numberOfLines={2}
            style={{ marginTop: 2, fontSize: 12, color: "#475569" }}
          >
            {message.text}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss reply preview"
          hitSlop={8}
          onPress={onDismiss}
          style={{
            width: 24,
            height: 24,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 12,
          }}
          className="h-7 w-7 items-center justify-center rounded-full active:bg-slate-100"
        >
          <X size={14} color="#64748B" />
        </Pressable>
      </View>
    </FloatingBannerSlot>
  );
}

/** First-visit "Need help booking?" nudge pill anchored cleanly above the orb or beside desktop orb. */
export function AssistantNudgePill({
  isDesktop,
  bottomOffset,
  onOpen,
  onDismiss,
}: {
  isDesktop: boolean;
  bottomOffset: number;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <FloatingBannerSlot
      isDesktop={isDesktop}
      desktopBottom={32}
      bottomOffset={bottomOffset}
      triggerKey="nudge"
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "center",
          gap: 8,
          borderRadius: 9999,
          borderWidth: 1.5,
          borderColor: "rgba(234, 88, 12, 0.35)",
          backgroundColor: "#FFFFFF",
          paddingLeft: 14,
          paddingRight: 10,
          paddingVertical: 7,
          shadowColor: "#00112E",
          shadowOpacity: 0.12,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
          elevation: 5,
        }}
        className="flex-row items-center rounded-full border border-[#EA580C]/35 bg-white shadow-lg"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Need help booking?"
          onPress={onOpen}
          style={{ flexDirection: "row", alignItems: "center" }}
          className="active:opacity-80"
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: "#00112E",
            }}
          >
            Need help booking?
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss chat suggestion"
          hitSlop={8}
          onPress={onDismiss}
          style={{
            width: 22,
            height: 22,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 11,
          }}
          className="h-6 w-6 items-center justify-center rounded-full active:bg-slate-100"
        >
          <X size={13} color="#64748B" />
        </Pressable>
      </View>
    </FloatingBannerSlot>
  );
}
