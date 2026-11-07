// Ported from frontend/apps/partner/features/proposal/view/parts/focused-header.tsx
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

export interface HeaderProps {
  eyebrow?: string;
  title: string;
  /** Where back goes. Rendered by the caller so this package owns no router. */
  backSlot?: ReactNode;
  onBack?: () => void;
  trailing?: ReactNode;
  className?: string;
}

export function HeaderTile({
  children,
  onPress,
  label,
}: {
  children: ReactNode;
  onPress?: () => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-control"
    >
      {children}
    </Pressable>
  );
}

/** 56px focused header: back control, title, navy band. */
export function Header({ eyebrow, title, backSlot, onBack, trailing, className }: HeaderProps) {
  return (
    <View
      className={cn(
        "min-h-14 flex-row items-center gap-2.5 bg-navy-900 px-3 pb-3.5",
        className,
      )}
    >
      {backSlot ??
        (onBack ? (
          <HeaderTile label="Back" onPress={onBack}>
            <Text className="text-2xl text-surface">‹</Text>
          </HeaderTile>
        ) : null)}
      <View className="min-w-0 flex-1">
        {eyebrow !== undefined ? (
          <Text className="text-[11px] font-bold uppercase tracking-wide text-navy-200">
            {eyebrow}
          </Text>
        ) : null}
        <Text className="mt-0.5 text-[17px] font-bold text-surface" numberOfLines={1}>
          {title}
        </Text>
      </View>
      {trailing}
    </View>
  );
}
