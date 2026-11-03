import { Headphones, HelpCircle } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface StickyFooterProps {
  helpIcon?: "help-circle" | "headset" | "none";
  helpLabel?: string;
  onHelpPress?: () => void;
  primaryLabel?: string;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  onPrimaryPress?: () => void;
  showOnlyHelp?: boolean;
  customActions?: ReactNode;
}

export function StickyFooter({
  helpIcon = "help-circle",
  helpLabel = "Need help?",
  onHelpPress,
  primaryLabel = "Continue →",
  primaryDisabled = false,
  primaryLoading = false,
  onPrimaryPress,
  showOnlyHelp = false,
  customActions,
}: StickyFooterProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === "ios" ? 34 : 16);

  return (
    <View style={[styles.container, { paddingBottom: bottomInset + 12 }]}>
      <View style={styles.inner}>
        {customActions ? (
          <View style={styles.customActionsWrapper}>{customActions}</View>
        ) : null}

        <View style={styles.actionRow}>
          {/* Left: Need help? with optional icon */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={helpLabel}
            onPress={onHelpPress}
            hitSlop={8}
            style={({ pressed }) => [styles.helpButton, pressed ? { opacity: 0.7 } : null]}
          >
            {helpIcon === "help-circle" ? (
              <HelpCircle size={16} color="#0b1b3a" strokeWidth={2.2} />
            ) : helpIcon === "headset" ? (
              <Headphones size={16} color="#0b1b3a" strokeWidth={2.2} />
            ) : null}
            <Text style={styles.helpButtonText}>{helpLabel}</Text>
          </Pressable>

          {/* Right: Primary action button if not showOnlyHelp */}
          {!showOnlyHelp && primaryLabel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={primaryLabel}
              disabled={primaryDisabled || primaryLoading}
              onPress={onPrimaryPress}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: primaryDisabled
                    ? "#d1d5db"
                    : pressed
                    ? "#d65e00"
                    : "#f26a0f",
                  opacity: primaryDisabled ? 0.95 : 1,
                },
              ]}
            >
              {primaryLoading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: Platform.OS === "web" ? ("fixed" as any) : "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderColor: "#f1f5f9",
    paddingHorizontal: 20,
    paddingTop: 14,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 -4px 16px rgba(11, 27, 58, 0.05)",
        } as any)
      : {
          elevation: 8,
          shadowColor: "#0b1b3a",
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.06,
          shadowRadius: 10,
        }),
  },
  inner: {
    width: "100%",
    maxWidth: 672,
    alignSelf: "center",
    flexDirection: "column",
    rowGap: 12,
  },
  customActionsWrapper: {
    width: "100%",
    flexDirection: "column",
    rowGap: 10,
  },
  actionRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  helpButton: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  helpButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0b1b3a",
    textDecorationLine: "underline",
  },
  primaryButton: {
    height: 48,
    minWidth: 130,
    paddingHorizontal: 28,
    borderRadius: 9999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 8,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 4px 14px rgba(242, 106, 15, 0.35)",
        } as any)
      : {
          elevation: 4,
          shadowColor: "#f26a0f",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
        }),
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
});
