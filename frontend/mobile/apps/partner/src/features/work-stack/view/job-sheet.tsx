import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** How much of the available area the sheet fills at rest: peek, half, nearly full. */
export const SHEET_SNAPS = [0.46, 0.68, 0.94] as const;

/**
 * The Rapido-style bottom sheet: the map fills the area behind it, this rises over it.
 *
 * `containerHeight` is the height of the area the screen really has (measured, not the phone's
 * window), so the sheet can never hang off the bottom. The sheet's own height changes between the
 * three snaps, so the scroll area inside is always exactly the part you can see, and everything in
 * it can be reached by scrolling. Drag the handle (or tap it) to move between heights. The primary
 * action sits in `footer`, always at the bottom of the sheet, never scrolled away.
 */
export function JobSheet({
  children,
  footer,
  containerHeight,
  initialSnap = 0,
  accessibilityLabel,
}: {
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly containerHeight: number;
  readonly initialSnap?: 0 | 1 | 2;
  readonly accessibilityLabel: string;
}) {
  const insets = useSafeAreaInsets();
  const heights = useMemo(() => SHEET_SNAPS.map((fraction) => Math.round(containerHeight * fraction)), [containerHeight]);

  const [h] = useState(() => new Animated.Value(heights[initialSnap]!));
  const snap = useRef<number>(initialSnap);
  const current = useRef(heights[initialSnap]!);
  const dragStart = useRef(0);

  // The area changed (rotation, keyboard): keep the same snap at the new size.
  useEffect(() => {
    current.current = heights[snap.current]!;
    h.setValue(current.current);
  }, [heights, h]);

  // The screen behind changed (a map arrived): settle at the height that suits it.
  useEffect(() => {
    if (snap.current === initialSnap) return;
    snap.current = initialSnap;
    current.current = heights[initialSnap]!;
    Animated.spring(h, { toValue: heights[initialSnap]!, useNativeDriver: false, damping: 22, stiffness: 220, mass: 0.9 }).start();
    // Only when the screen asks for a new height, never when the user has dragged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSnap]);

  const goTo = (index: number) => {
    snap.current = index;
    current.current = heights[index]!;
    Animated.spring(h, { toValue: heights[index]!, useNativeDriver: false, damping: 22, stiffness: 220, mass: 0.9 }).start();
  };

  const settle = (velocityY: number) => {
    // Dragging up (negative velocity) grows the sheet.
    const projected = current.current - velocityY * 140;
    let best = 0;
    heights.forEach((height, index) => {
      if (Math.abs(height - projected) < Math.abs(heights[best]! - projected)) best = index;
    });
    goTo(best);
  };

  const pan = useMemo(
    () =>
      // The handlers only read the refs when a finger moves, never during render.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          h.stopAnimation((value) => {
            dragStart.current = value;
            current.current = value;
          });
        },
        onPanResponderMove: (_event, gesture) => {
          const next = Math.min(heights[2]!, Math.max(heights[0]!, dragStart.current - gesture.dy));
          current.current = next;
          h.setValue(next);
        },
        onPanResponderRelease: (_event, gesture) => {
          if (Math.abs(gesture.dx) + Math.abs(gesture.dy) < 6) {
            goTo((snap.current + 1) % heights.length);
          } else {
            settle(gesture.vy);
          }
        },
        onPanResponderTerminate: (_event, gesture) => settle(gesture.vy),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [heights],
  );

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      className="absolute inset-x-0 bottom-0 overflow-hidden rounded-t-[28px] border border-b-0 border-line bg-surface shadow-lg"
      style={{ height: h }}
    >
      <View {...pan.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel="Resize the details panel" className="items-center pb-2 pt-3">
        <View className="h-1.5 w-12 rounded-full bg-line-strong" />
      </View>
      <ScrollView
        className="flex-1"
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-4 px-4 pt-1"
        contentContainerStyle={{ paddingBottom: footer ? 16 : Math.max(insets.bottom, 16) + 8 }}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View className="gap-3 border-t border-line bg-surface px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          {footer}
        </View>
      ) : null}
    </Animated.View>
  );
}
