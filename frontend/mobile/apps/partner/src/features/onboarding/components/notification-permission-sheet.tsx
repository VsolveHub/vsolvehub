import { registerForPush } from "@vsolve/mobile-core";
import * as Notifications from "expo-notifications";
import Svg, { G, Path } from "react-native-svg";
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

        <View style={[styles.sheetCard, { paddingBottom: bottomInset + 16 }]}>
          {/* Grabber Handle */}
          <View style={styles.grabber} />

          {/* Ringing Bell Illustration Matching Mockup */}
          <View style={styles.bellCircle}>
            <Svg width={80} height={80} viewBox="0 0 80 80" fill="none">
              {/* 3 Radiating Sound Rays (Top-Right) */}
              <Path
                d="M 54 17 L 57 11"
                stroke="#f87000"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <Path
                d="M 62 25 L 70 21"
                stroke="#f87000"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <Path
                d="M 64 35 L 72 36"
                stroke="#f87000"
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              {/* Tilted Bell Body Matching Exact Geometry */}
              <G transform="rotate(-12, 38, 38)">
                {/* Bell Contour with Flared Base and Soft Curve */}
                <Path
                  d="M 38 16
                     C 32 16 28 20 27 26
                     C 25 33 24 40 20 47
                     C 18 51 18 54 22 55
                     C 28 56 48 56 54 55
                     C 58 54 58 51 56 47
                     C 52 40 51 33 49 26
                     C 48 20 44 16 38 16
                     Z"
                  fill="#ffe5d3"
                  stroke="#f87000"
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </G>
            </Svg>
          </View>

          {/* Title and Subtitle */}
          <Text style={styles.title}>Turn on notifications?</Text>
          <Text style={styles.body}>
            Know the moment your application{"\n"}is approved.
          </Text>

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
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
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
    height: 4.5,
    borderRadius: 9999,
    backgroundColor: "#d1d5db",
    marginTop: 4,
    marginBottom: 20,
  },
  bellCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#fff2e8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 25,
    fontWeight: "800",
    color: "#071328",
    textAlign: "center",
    letterSpacing: -0.4,
  },
  body: {
    fontSize: 15.5,
    color: "#556476",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
    maxWidth: 280,
  },
  actions: {
    width: "100%",
    marginTop: 26,
    alignItems: "center",
  },
  allowButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: "#f87000",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 4px 14px rgba(248, 112, 0, 0.35)",
        } as any)
      : {
          elevation: 4,
          shadowColor: "#f87000",
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
    marginTop: 18,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  notNowText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#071328",
    textDecorationLine: "underline",
  },
});