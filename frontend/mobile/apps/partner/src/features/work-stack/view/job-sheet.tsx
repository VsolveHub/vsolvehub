import { useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** How much of the screen the sheet shows at rest: peek, half, nearly full. */
export const SHEET_SNAPS = [0.42, 0.62, 0.9] as const;

/**
 * The Rapido-style bottom sheet: the map fills the screen behind it, this slides over it.
 *
 * Drag the handle or the header to move it between three heights; it springs to the nearest one.
 * The primary action lives in `footer`, pinned to the bottom of the screen, so it is on screen at
 * every height and never scrolled away. Built on RN's own `Animated` and `PanResponder`, so it needs
 * no gesture-handler root and runs the same in tests.
 */
export function JobSheet({
  children,
  footer,
  initialSnap = 0,
  accessibilityLabel,
}: {
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly initialSnap?: 0 | 1 | 2;
  readonly accessibilityLabel: string;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);

  const sheetHeight = height * SHEET_SNAPS[2];
  // translateY for each snap: 0 is fully open.
  const stops = useMemo(() => SHEET_SNAPS.map((fraction) => sheetHeight - height * fraction), [height, sheetHeight]);

  const [y] = useState(() => new Animated.Value(stops[initialSnap]!));
  const current = useRef(stops[initialSnap]!);
  const dragStart = useRef(stops[initialSnap]!);

  const settle = (velocity: number) => {
    const projected = current.current + velocity * 120;
    const target = stops.reduce((best, stop) => (Math.abs(stop - projected) < Math.abs(best - projected) ? stop : best), stops[0]!);
    current.current = target;
    Animated.spring(y, { toValue: target, useNativeDriver: true, damping: 22, stiffness: 220, mass: 0.9 }).start();
  };

  const pan = useMemo(
    () =>
      // The handlers only read the refs when a finger moves, never during render.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4,
        onPanResponderGrant: () => {
          y.stopAnimation((value) => {
            dragStart.current = value;
            current.current = value;
          });
        },
        onPanResponderMove: (_event, gesture) => {
          const next = Math.min(stops[0]!, Math.max(stops[2]!, dragStart.current + gesture.dy));
          current.current = next;
          y.setValue(next);
        },
        onPanResponderRelease: (_event, gesture) => settle(gesture.vy),
        onPanResponderTerminate: (_event, gesture) => settle(gesture.vy),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stops],
  );

  return (
    <>
      <Animated.View
        accessibilityLabel={accessibilityLabel}
        className="absolute inset-x-0 bottom-0 overflow-hidden rounded-t-[28px] border border-b-0 border-line bg-surface shadow-lg"
        style={{ height: sheetHeight, transform: [{ translateY: y }] }}
      >
        <View {...pan.panHandlers} className="items-center pb-1 pt-2.5">
          <View className="h-1.5 w-11 rounded-full bg-line-strong" />
        </View>
        <ScrollView
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerClassName="gap-4 px-4 pt-2"
          contentContainerStyle={{ paddingBottom: footerHeight + insets.bottom + 24 }}
        >
          {children}
        </ScrollView>
      </Animated.View>
      {footer ? (
        <View
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
          className="absolute inset-x-0 bottom-0 gap-3 border-t border-line bg-surface px-4 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          {footer}
        </View>
      ) : null}
    </>
  );
}
