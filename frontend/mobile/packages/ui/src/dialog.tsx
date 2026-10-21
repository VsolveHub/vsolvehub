import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line } from "react-native-svg";
import { BlurView } from "expo-blur";

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

export interface BlurBackdropProps {
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function BlurBackdrop({
  onPress,
  accessibilityLabel = "Close backdrop",
}: BlurBackdropProps) {
  return (
    <>
      {Platform.OS === "web" ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: "rgba(0, 17, 46, 0.45)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            } as never,
          ]}
        />
      ) : (
        <>
          <BlurView
            intensity={40}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0, 17, 46, 0.35)" },
            ]}
          />
        </>
      )}
      {onPress ? (
        <Pressable
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      onPress={onPress}
      hitSlop={12}
      className="h-8 w-8 items-center justify-center rounded-full bg-surface-sunken active:bg-surface-hover"
    >
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <Line x1={18} y1={6} x2={6} y2={18} />
        <Line x1={6} y1={6} x2={18} y2={18} />
      </Svg>
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
  const { height: windowHeight } = useWindowDimensions();
  const maxDialogHeight = Math.min(windowHeight - 64, Math.floor(windowHeight * 0.85));

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => dismissable && onOpenChange(false)}>
      <View className="flex-1">
        <BlurBackdrop
          onPress={dismissable ? () => onOpenChange(false) : undefined}
          accessibilityLabel="Close dialog backdrop"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
          className="flex-1 items-center justify-center px-4"
          pointerEvents="box-none"
        >
          <View
            className={cn("w-full max-w-sm rounded-[1.75rem] bg-surface p-6 shadow-2xl flex-col", className)}
            style={{ maxHeight: maxDialogHeight }}
          >
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className="text-xl font-bold text-text">{title}</Text>
                {description ? <Text className="mt-1 text-sm text-text-secondary leading-snug">{description}</Text> : null}
              </View>
              {dismissable ? <CloseButton onPress={() => onOpenChange(false)} /> : null}
            </View>
            <View className="mt-4 flex-1 min-h-0">{children}</View>
            {footer ? <View className="mt-4 flex-row justify-end gap-2">{footer}</View> : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function Sheet(props: BaseProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { open, onOpenChange, title, description, children, footer, dismissable = true, className } = props;
  const maxSheetHeight = Math.min(windowHeight - Math.max(insets.top, 24) - 24, Math.floor(windowHeight * 0.85));

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => dismissable && onOpenChange(false)}>
      <View className="flex-1 justify-end">
        <BlurBackdrop
          onPress={dismissable ? () => onOpenChange(false) : undefined}
          accessibilityLabel="Close sheet backdrop"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="justify-end"
          pointerEvents="box-none"
        >
          <View
            className={cn("rounded-t-card bg-surface px-5 pt-3 flex-col", className)}
            style={{
              maxHeight: maxSheetHeight,
              paddingBottom: Math.max(16, insets.bottom),
            }}
          >
            <View className="mb-2 h-1.5 w-12 self-center rounded-full bg-line-strong/60" />
            <View className="flex-row items-center justify-between pb-2 border-b border-line/40">
              <View className="min-w-0 flex-1 mr-2">
                <Text className="text-lg font-bold text-navy-900">{title}</Text>
                {description ? <Text className="mt-0.5 text-xs text-text-secondary leading-snug">{description}</Text> : null}
              </View>
              {dismissable ? <CloseButton onPress={() => onOpenChange(false)} /> : null}
            </View>
            <View className="flex-1 min-h-0 mt-3">{children}</View>
            {footer ? <View className="mt-3 pt-2 border-t border-line/40">{footer}</View> : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
