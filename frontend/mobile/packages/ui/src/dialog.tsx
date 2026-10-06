// Ported from frontend/packages/ui/src/dialog.tsx
import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cn } from "./cn";
import { Text } from "./text";

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  dismissable?: boolean;
  className?: string;
}

function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onPress} className="h-11 w-11 items-center justify-center">
      <Text className="text-lg text-text">×</Text>
    </Pressable>
  );
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  dismissable = true,
  className,
}: BaseProps) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => dismissable && onOpenChange(false)}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        {dismissable ? (
          <Pressable
            accessibilityLabel="Close dialog backdrop"
            onPress={() => onOpenChange(false)}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View className={cn("w-full max-w-md rounded-card bg-surface p-5", className)}>
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-lg font-bold text-text">{title}</Text>
              {description ? <Text className="mt-1 text-sm text-text-secondary">{description}</Text> : null}
            </View>
            {dismissable ? <CloseButton onPress={() => onOpenChange(false)} /> : null}
          </View>
          <View className="mt-4">{children}</View>
          {footer ? <View className="mt-4 flex-row justify-end gap-2">{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

export function Sheet(props: BaseProps) {
  const insets = useSafeAreaInsets();
  const { open, onOpenChange, title, description, children, footer, dismissable = true, className } = props;
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => dismissable && onOpenChange(false)}>
      <View className="flex-1 justify-end bg-black/40">
        {dismissable ? (
          <Pressable
            accessibilityLabel="Close sheet backdrop"
            onPress={() => onOpenChange(false)}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View
          className={cn("rounded-t-card bg-surface px-5 pt-4", className)}
          style={{ paddingBottom: Math.max(16, insets.bottom) }}
        >
          <View className="mb-2 h-1 w-10 self-center rounded-full bg-line" />
          <View className="flex-row items-start justify-between">
            <View className="min-w-0 flex-1">
              <Text className="text-lg font-bold text-text">{title}</Text>
              {description ? <Text className="mt-1 text-sm text-text-secondary">{description}</Text> : null}
            </View>
            {dismissable ? <CloseButton onPress={() => onOpenChange(false)} /> : null}
          </View>
          <View className="mt-4">{children}</View>
          {footer ? <View className="mt-4">{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}
