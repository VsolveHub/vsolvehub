import { Text, cn } from "@vsolve/mobile-ui";
import { useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, PanResponder, Vibration, View } from "react-native";

import { Pictogram, type PictogramName } from "./pictogram";

const THUMB = 64;
const DONE_AT = 0.82;

/**
 * "Slide to confirm": a step that is easy to do on purpose and hard to do by accident, for the one
 * tap that tells the Customer the Partner has arrived. Screen-reader and switch users get a plain
 * button action instead of a drag (`accessibilityActions`), so the step never needs a gesture.
 */
export function SlideToConfirm({
  label,
  icon = "yes",
  disabled = false,
  onConfirm,
}: {
  readonly label: string;
  readonly icon?: PictogramName;
  readonly disabled?: boolean;
  readonly onConfirm: () => void;
}) {
  const [width, setWidth] = useState(0);
  const [x] = useState(() => new Animated.Value(0));
  const range = Math.max(0, width - THUMB - 8);
  const done = useRef(false);

  const confirm = () => {
    if (done.current || disabled) return;
    done.current = true;
    Vibration.vibrate(30);
    onConfirm();
    // Ready again if the server refuses and the step stays where it was.
    setTimeout(() => {
      done.current = false;
      Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
    }, 1500);
  };

  const pan = useMemo(
    () =>
      // The handlers only read the refs when a finger moves, never during render.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderMove: (_event, gesture) => x.setValue(Math.min(range, Math.max(0, gesture.dx))),
        onPanResponderRelease: (_event, gesture) => {
          if (range > 0 && gesture.dx / range >= DONE_AT) {
            Animated.timing(x, { toValue: range, duration: 80, useNativeDriver: true }).start(confirm);
          } else {
            Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
          }
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range, disabled],
  );

  // The label fades as the thumb covers it.
  const labelOpacity = x.interpolate({ inputRange: [0, Math.max(1, range * 0.6)], outputRange: [1, 0], extrapolate: "clamp" });

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Double tap to confirm"
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: "activate" }]}
      onAccessibilityAction={() => {
        void AccessibilityInfo.announceForAccessibility(label);
        confirm();
      }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      className={cn("h-20 justify-center overflow-hidden rounded-[24px] bg-success-text", disabled && "opacity-60")}
    >
      <Animated.View className="absolute inset-x-0 items-center" style={{ opacity: labelOpacity }}>
        <Text className="pl-12 text-xl font-bold text-surface">{label}</Text>
      </Animated.View>
      <Animated.View
        {...pan.panHandlers}
        className="ml-1 items-center justify-center rounded-[20px] bg-surface"
        style={{ width: THUMB, height: THUMB, transform: [{ translateX: x }] }}
      >
        <Pictogram name={icon} size="lg" className="text-success-text" />
      </Animated.View>
    </View>
  );
}
