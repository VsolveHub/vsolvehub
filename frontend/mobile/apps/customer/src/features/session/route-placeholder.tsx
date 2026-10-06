import { View } from "react-native";

import { Text } from "@vsolve/mobile-ui";

export function RoutePlaceholder({ path }: { path: string }) {
  return (
    <View className="flex-1 bg-canvas px-4 py-6">
      <Text className="text-base text-text">{path}</Text>
    </View>
  );
}
