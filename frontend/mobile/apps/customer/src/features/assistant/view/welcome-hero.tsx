import { Text } from "@vsolve/mobile-ui";
import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

import { useCategories } from "@/features/catalog/client-queries";

/**
 * Shown at the top of a chat until the customer says something. It eases in once
 * (fade, rise and a small grow), then the helper bobs gently. Everything runs on the
 * native driver and stops when the block goes away. With the phone's "reduce motion"
 * setting on, it just appears and stays still.
 */
export function WelcomeHero({
  onPick,
  disabled,
}: {
  /** Called with a service category's name when the customer taps its chip. */
  onPick: (categoryName: string) => void;
  disabled: boolean;
}) {
  const categoryNames = useStarterCategories();
  const [entrance] = useState(() => new Animated.Value(0));
  const [bob] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let active = true;
    const running: Animated.CompositeAnimation[] = [];
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!active) return;
      if (reduceMotion) {
        entrance.setValue(1);
        return;
      }
      const arrive = Animated.timing(entrance, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      const float = Animated.loop(
        Animated.sequence([
          Animated.timing(bob, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(bob, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
      running.push(arrive, float);
      arrive.start();
      float.start();
    });
    return () => {
      active = false;
      running.forEach((animation) => animation.stop());
    };
  }, [entrance, bob]);

  return (
    <Animated.View
      className="w-full items-center justify-center py-5"
      style={{
        width: "100%",
        alignItems: "center",
        justifyContent: "center",
        opacity: entrance,
        transform: [
          { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
          { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
        ],
      }}
    >
      <View
        className="h-28 w-28 items-center justify-center self-center rounded-full bg-orange-50"
        style={{
          width: 112,
          height: 112,
          borderRadius: 56,
          alignItems: "center",
          justifyContent: "center",
          alignSelf: "center",
        }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View
          style={{
            alignItems: "center",
            justifyContent: "center",
            transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
          }}
        >
          <HelperBot />
        </Animated.View>
      </View>
      <Text
        className="mt-3 self-center text-center text-lg font-extrabold tracking-tight text-navy-900"
        style={{ textAlign: "center", alignSelf: "center" }}
      >
        V Solve <Text className="text-lg font-extrabold text-[#EA580C]">Hub</Text> AI
      </Text>
      <Text
        className="mt-1 self-center text-center text-sm text-[#6B6560]"
        style={{ textAlign: "center", alignSelf: "center" }}
      >
        How can I help you today?
      </Text>
      {categoryNames.length ? (
        <View
          className="mt-4 w-full flex-row flex-wrap items-center justify-center gap-2 px-2"
          style={{ width: "100%", alignItems: "center", justifyContent: "center" }}
        >
          {categoryNames.map((name) => (
            <Pressable
              key={name}
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => onPick(name)}
              className={`min-h-11 max-w-full justify-center rounded-full border border-[#EA580C]/30 bg-white px-4 active:bg-orange-50 ${
                disabled ? "opacity-50" : ""
              }`}
            >
              <Text numberOfLines={1} className="text-sm font-medium text-navy-900">
                {name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

const MAX_STARTER_CHIPS = 6;
const MAX_CHIP_NAME_LENGTH = 40;

/**
 * Starter chips come from the service categories the server already serves, never a list
 * typed into the app. Until they load, or if they fail or come back empty, there are none and
 * the welcome simply has no chips. Blank, over-long and repeated names are left out.
 */
function useStarterCategories(): string[] {
  const categories = useCategories();
  return useMemo(() => {
    const names = (categories.data ?? [])
      .map((category) => category.name.trim())
      .filter((name) => name.length > 0 && name.length <= MAX_CHIP_NAME_LENGTH);
    return [...new Set(names)].slice(0, MAX_STARTER_CHIPS);
  }, [categories.data]);
}

/** The V Solve Hub helper: a friendly navy bot with the brand's orange. Decorative only. */
export function HelperBot({
  size = 84,
  animated = true,
}: {
  size?: number;
  animated?: boolean;
}) {
  const [blinking, setBlinking] = useState(false);
  const [antennaPulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!animated) {
      antennaPulse.setValue(0);
      return;
    }
    let active = true;
    let intervalTimer: ReturnType<typeof setInterval> | undefined;
    let blinkTimer: ReturnType<typeof setTimeout> | undefined;
    let pulseLoop: Animated.CompositeAnimation | undefined;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!active || reduceMotion) return;
      intervalTimer = setInterval(() => {
        setBlinking(true);
        blinkTimer = setTimeout(() => {
          if (active) setBlinking(false);
        }, 140);
      }, 4800);

      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(antennaPulse, {
            toValue: 1,
            duration: 1100,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(antennaPulse, {
            toValue: 0,
            duration: 1100,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
      pulseLoop.start();
    });

    return () => {
      active = false;
      if (intervalTimer) clearInterval(intervalTimer);
      if (blinkTimer) clearTimeout(blinkTimer);
      pulseLoop?.stop();
    };
  }, [animated, antennaPulse]);

  const tipSize = Math.max(8, Math.round(size * 0.14));
  const tipLeft = size / 2 - tipSize / 2;
  const tipTop = (size * 10) / 120 - tipSize / 2;

  return (
    <View style={{ width: size, height: size }} className="relative items-center justify-center">
      {animated ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: tipLeft,
            top: tipTop,
            width: tipSize,
            height: tipSize,
            borderRadius: tipSize / 2,
            backgroundColor: "#EA580C",
            opacity: antennaPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
            transform: [
              { scale: antennaPulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.7] }) },
            ],
          }}
        />
      ) : null}
      <Svg width={size} height={size} viewBox="0 0 120 120">
        {/* antenna */}
        <Line x1={60} y1={24} x2={60} y2={12} stroke="#0B1B3D" strokeWidth={4} strokeLinecap="round" />
        <Circle cx={60} cy={10} r={6} fill="#EA580C" />
        {/* ears */}
        <Rect x={10} y={50} width={11} height={24} rx={5.5} fill="#EA580C" />
        <Rect x={99} y={50} width={11} height={24} rx={5.5} fill="#EA580C" />
        {/* shoulders */}
        <Rect x={34} y={94} width={52} height={22} rx={11} fill="#0B1B3D" />
        <Circle cx={60} cy={105} r={4} fill="#EA580C" />
        {/* head */}
        <Rect x={18} y={24} width={84} height={68} rx={26} fill="#0B1B3D" />
        {/* face plate */}
        <Rect x={27} y={34} width={66} height={46} rx={20} fill="#FFFFFF" />
        {/* eyes */}
        {blinking ? (
          <>
            <Path d="M41 55 Q47 59 53 55" stroke="#0B1B3D" strokeWidth={3.2} strokeLinecap="round" fill="none" />
            <Path d="M67 55 Q73 59 79 55" stroke="#0B1B3D" strokeWidth={3.2} strokeLinecap="round" fill="none" />
          </>
        ) : (
          <>
            <Circle cx={47} cy={55} r={6} fill="#0B1B3D" />
            <Circle cx={73} cy={55} r={6} fill="#0B1B3D" />
            <Circle cx={49} cy={53} r={2} fill="#FFFFFF" />
            <Circle cx={75} cy={53} r={2} fill="#FFFFFF" />
          </>
        )}
        {/* cheeks and smile */}
        <Circle cx={38} cy={65} r={4} fill="#EA580C" opacity={0.25} />
        <Circle cx={82} cy={65} r={4} fill="#EA580C" opacity={0.25} />
        <Path d="M51 66 Q60 74 69 66" stroke="#0B1B3D" strokeWidth={3.5} strokeLinecap="round" fill="none" />
      </Svg>
    </View>
  );
}
