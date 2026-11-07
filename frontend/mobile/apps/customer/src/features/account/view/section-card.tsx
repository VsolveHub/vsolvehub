import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@vsolve/mobile-ui";

export interface SectionCardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function SectionCard({ title, children, className = "" }: SectionCardProps) {
  return (
    <View className={`overflow-hidden rounded-[1.25rem] border border-[#e7e2da]/80 bg-white shadow-xs ${className}`}>
      {title ? (
        <View className="border-b border-line/60 bg-[#FAF9F7] px-4 py-3">
          <Text className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
            {title}
          </Text>
        </View>
      ) : null}
      <View className="divide-y divide-line/60">
        {children}
      </View>
    </View>
  );
}
