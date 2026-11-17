import { Text } from "@vsolve/mobile-ui";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

/**
 * Shown at the top of a chat until the customer says something. It eases in once
 * (fade, rise and a small grow), then the helper bobs gently. Everything runs on the
 * native driver and stops when the block goes away. With the phone's "reduce motion"
 * setting on, it just appears and stays still.
 */
export function WelcomeHero() {
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
      className="items-center py-5"
      style={{
        opacity: entrance,
        transform: [
          { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
          { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
        ],
      }}
    >
      <View
        className="size-28 items-center justify-center rounded-full bg-orange-50"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View
          style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }}
        >
          <HelperBot />
        </Animated.View>
      </View>
      <Text className="mt-3 text-lg font-extrabold tracking-tight text-navy-900">
        V Solve <Text className="text-lg font-extrabold text-[#EA580C]">Hub</Text> AI
      </Text>
      <Text className="mt-1 text-sm text-[#6B6560]">How can I help you today?</Text>
    </Animated.View>
  );
}

/** The V Solve Hub helper: a friendly navy bot with the brand's orange. Decorative only. */
function HelperBot() {
  return (
    <Svg width={84} height={84} viewBox="0 0 120 120">
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
      <Circle cx={47} cy={55} r={6} fill="#0B1B3D" />
      <Circle cx={73} cy={55} r={6} fill="#0B1B3D" />
      <Circle cx={49} cy={53} r={2} fill="#FFFFFF" />
      <Circle cx={75} cy={53} r={2} fill="#FFFFFF" />
      {/* cheeks and smile */}
      <Circle cx={38} cy={65} r={4} fill="#EA580C" opacity={0.25} />
      <Circle cx={82} cy={65} r={4} fill="#EA580C" opacity={0.25} />
      <Path d="M51 66 Q60 74 69 66" stroke="#0B1B3D" strokeWidth={3.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
