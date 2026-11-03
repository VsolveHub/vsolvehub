import { registerForPush } from "@vsolve/mobile-core";
import * as Notifications from "expo-notifications";
import { Bell } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface NotificationPermissionSheetProps {
  visible: boolean;
  onClose: () => void;
  onGranted?: () => void;
}

export function NotificationPermissionSheet({
  visible,
  onClose,
  onGranted,
}: NotificationPermissionSheetProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === "ios" ? 34 : 16);
  const [requesting, setRequesting] = useState(false);

  const handleAllow = async () => {
    setRequesting(true);
    try {
      if (Platform.OS !== "web") {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus === "granted") {
          await registerForPush({ appKind: "partner" });
        }
      }
      onGranted?.();
    } catch {
      // Permission request error handling
    } finally {
      setRequesting(false);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss sheet"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.sheetCard, { paddingBottom: bottomInset + 20 }]}>
          {/* Grabber Handle */}
          <View style={styles.grabber} />

          {/* Large Ringing Bell Illustration */}
          <View style={styles.bellCircleContainer}>
            <View style={styles.bellCircle}>
              {/* Decorative Ring Ticks */}
              <View style={styles.ringTickLeft} />
              <View style={styles.ringTickRight} />
              <Bell size={42} color="#f26a0f" strokeWidth={2.2} />
            </View>
          </View>

          {/* Title and Subtitle */}
          <Text style={styles.title}>Turn on notifications?</Text>
          <Text style={styles.body}>Know the moment your application is approved.</Text>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Allow notifications"
              disabled={requesting}
              onPress={handleAllow}
              style={({ pressed }) => [
                styles.allowButton,
                pressed ? styles.allowButtonPressed : null,
              ]}
            >
              {requesting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.allowButtonText}>Allow notifications</Text>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Not now"
              onPress={onClose}
              style={({ pressed }) => [styles.notNowButton, pressed ? { opacity: 0.6 } : null]}
            >
              <Text style={styles.notNowText}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 17, 46, 0.45)",
    justifyContent: "flex-end",
  },
  sheetCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    width: "100%",
    maxWidth: 672,
    alignSelf: "center",
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 -8px 30px rgba(0, 17, 46, 0.15)",
        } as any)
      : {
          elevation: 16,
          shadowColor: "#00112e",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.15,
          shadowRadius: 16,
        }),
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#d1d5db",
    marginBottom: 28,
  },
  bellCircleContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  bellCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#ffe9d6",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  ringTickLeft: {
    position: "absolute",
    top: 14,
    right: 18,
    width: 6,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#f26a0f",
    transform: [{ rotate: "45deg" }],
  },
  ringTickRight: {
    position: "absolute",
    top: 18,
    right: 14,
    width: 6,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#f26a0f",
    transform: [{ rotate: "20deg" }],
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0b1b3a",
    textAlign: "center",
    letterSpacing: -0.4,
  },
  body: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  actions: {
    width: "100%",
    marginTop: 28,
    flexDirection: "column",
    rowGap: 14,
  },
  allowButton: {
    height: 52,
    borderRadius: 9999,
    backgroundColor: "#f26a0f",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
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
  allowButtonPressed: {
    backgroundColor: "#d65e00",
  },
  allowButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  notNowButton: {
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  notNowText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0b1b3a",
    textDecorationLine: "underline",
  },
});
