// Ported from frontend/packages/ui/src/logo.tsx
import { Image, View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

const logoMark = require("./logo-mark.png");

export function Logo({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <View className={cn("flex-row items-center gap-2", className)}>
      <View
        className={cn(
          "h-7 w-7 items-center justify-center overflow-hidden rounded-full shrink-0",
          dark ? "bg-white" : "bg-transparent",
        )}
      >
        <Image
          source={logoMark}
          style={{ width: 28, height: 28 }}
          resizeMode="contain"
          accessibilityLabel="V Solve Hub"
        />
      </View>
      <Text className={cn("font-sans text-[1.15rem] font-extrabold tracking-tight", dark ? "text-white" : "text-navy-900")}>
        V Solve <Text className={dark ? "text-[#FF8F50]" : "text-[#EA580C]"}>Hub</Text>
      </Text>
    </View>
  );
}

