import { Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

export interface GroupLabelProps {
  label: string;
}

export function GroupLabel({ label }: GroupLabelProps) {
  return (
    <View className="px-1 pb-1 pt-2">
      <Text className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
        {label}
      </Text>
    </View>
  );
}
