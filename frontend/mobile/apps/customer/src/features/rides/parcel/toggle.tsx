import { SegmentedTrack, Text, segmentStyles } from "@vsolve/mobile-ui";
import { Pressable } from "react-native";

/** Two or three choices side by side, one selected: "I'm sending | I'm receiving", "Sender | Receiver". */
export function Toggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <SegmentedTrack label={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className={segmentStyles({ selected })}
          >
            <Text className={selected ? "text-sm font-bold text-text" : "text-sm font-medium text-text-muted"}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </SegmentedTrack>
  );
}
