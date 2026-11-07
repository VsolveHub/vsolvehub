import { Text, cn } from "@vsolve/mobile-ui";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Animated, Pressable, TextInput, View } from "react-native";

/** The server's code is a few digits; four boxes show, and more appear if more are typed. */
const MIN_BOXES = 4;
const MAX_DIGITS = 8;

/**
 * The start code as big digit boxes. One hidden number input drives them, so the keyboard opens on a
 * tap anywhere on the boxes and the phone's SMS auto-fill still works. `error` shakes the boxes
 * three times: a wrong code reads as a wrong code, not as a frozen screen.
 */
export function CodeBoxes({
  value,
  onChange,
  error,
  autoFocus = true,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error: boolean;
  readonly autoFocus?: boolean;
}) {
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [shake] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!error) return;
    Animated.sequence(
      [10, -10, 8, -8, 4, 0].map((toValue) => Animated.timing(shake, { toValue, duration: 55, useNativeDriver: true })),
    ).start();
  }, [error, shake]);

  const boxes = Math.max(MIN_BOXES, value.length);

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Start code. Tap to type it." onPress={() => input.current?.focus()}>
      <Animated.View className="flex-row justify-center gap-2.5" style={{ transform: [{ translateX: shake }] }}>
        {Array.from({ length: boxes }, (_, index) => {
          const digit = value[index];
          const active = index === Math.min(value.length, boxes - 1);
          return (
            <View
              key={index}
              className={cn(
                "h-16 w-14 items-center justify-center rounded-2xl border-2 bg-surface-sunken",
                error ? "border-danger-line bg-danger-surface" : active ? "border-action-secondary bg-surface" : "border-line",
              )}
            >
              <Text className="text-[2rem] font-extrabold text-text">{digit ?? ""}</Text>
            </View>
          );
        })}
      </Animated.View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(next) => onChange(next.replace(/\D/g, "").slice(0, MAX_DIGITS))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus={autoFocus}
        maxLength={MAX_DIGITS}
        accessibilityLabel="Start code"
        caretHidden
        className="absolute h-0 w-0 opacity-0"
      />
    </Pressable>
  );
}
