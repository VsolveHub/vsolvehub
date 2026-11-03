import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import {
  AlertTriangle,
  Bell,
  ExternalLink,
  FileText,
  Tag,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { NavyHeaderLayout } from "@/features/onboarding/components/navy-header-layout";

export function NotificationSettingsScreen() {
  const router = useRouter();
  const [notificationsBlocked, setNotificationsBlocked] = useState(true);
  const [applicationsEnabled, setApplicationsEnabled] = useState(true);
  const [updatesEnabled, setUpdatesEnabled] = useState(true);
  const [offersEnabled, setOffersEnabled] = useState(false);

  useEffect(() => {
    async function checkPermission() {
      if (Platform.OS !== "web") {
        try {
          const { status } = await Notifications.getPermissionsAsync();
          setNotificationsBlocked(status !== "granted");
        } catch {
          // Default to true to match mockup screen 13
          setNotificationsBlocked(true);
        }
      }
    }
    void checkPermission();
  }, []);

  const handleOpenSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      // Fallback
    }
  };

  return (
    <NavyHeaderLayout
      title="Notification settings"
      subtitle="Stay in the loop with updates about your applications and more."
      onBack={() => router.back()}
    >
      <View style={styles.container}>
        {/* Blocked Notifications Banner matching Screen 13 */}
        {notificationsBlocked ? (
          <View style={styles.warningCard}>
            <View style={styles.warningHeader}>
              <View style={styles.warningIconCircle}>
                <AlertTriangle size={22} color="#f26a0f" strokeWidth={2.2} />
              </View>
              <View style={styles.warningInfo}>
                <Text style={styles.warningTitle}>Notifications are blocked</Text>
                <Text style={styles.warningSubtitle}>
                  To receive important updates, please enable notifications in your device settings.
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              onPress={handleOpenSettings}
              style={({ pressed }) => [
                styles.openSettingsButton,
                pressed ? { opacity: 0.9 } : null,
              ]}
            >
              <Text style={styles.openSettingsButtonText}>Open settings</Text>
              <ExternalLink size={16} color="#ffffff" strokeWidth={2.2} style={{ marginLeft: 6 }} />
            </Pressable>
          </View>
        ) : null}

        {/* 3 Notification Toggle Rows matching Screen 13 */}
        <View style={styles.toggleList}>
          {/* Row 1: Applications */}
          <View style={styles.toggleRow}>
            <View style={styles.rowLeft}>
              <View style={styles.iconBox}>
                <Bell size={20} color="#00112e" strokeWidth={2.2} />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Applications</Text>
                <Text style={styles.rowSubtitle}>Status, approvals and requests</Text>
              </View>
            </View>
            <Switch
              value={applicationsEnabled}
              onValueChange={setApplicationsEnabled}
              trackColor={{ false: "#e2e8f0", true: "#f26a0f" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#e2e8f0"
            />
          </View>

          {/* Row 2: Application updates */}
          <View style={styles.toggleRow}>
            <View style={styles.rowLeft}>
              <View style={styles.iconBox}>
                <FileText size={20} color="#00112e" strokeWidth={2.2} />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Application updates</Text>
                <Text style={styles.rowSubtitle}>Progress and important changes</Text>
              </View>
            </View>
            <Switch
              value={updatesEnabled}
              onValueChange={setUpdatesEnabled}
              trackColor={{ false: "#e2e8f0", true: "#f26a0f" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#e2e8f0"
            />
          </View>

          {/* Row 3: Offers and tips */}
          <View style={styles.toggleRow}>
            <View style={styles.rowLeft}>
              <View style={styles.iconBox}>
                <Tag size={20} color="#00112e" strokeWidth={2.2} />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Offers and tips</Text>
                <Text style={styles.rowSubtitle}>New services, features and ideas</Text>
              </View>
            </View>
            <Switch
              value={offersEnabled}
              onValueChange={setOffersEnabled}
              trackColor={{ false: "#e2e8f0", true: "#f26a0f" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#e2e8f0"
            />
          </View>
        </View>
      </View>
    </NavyHeaderLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "column",
    width: "100%",
  },
  warningCard: {
    backgroundColor: "#fff7ed",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#fed7aa",
    padding: 16,
    marginBottom: 20,
    flexDirection: "column",
  },
  warningHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    columnGap: 12,
  },
  warningIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ffedd5",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  warningInfo: {
    flex: 1,
    flexDirection: "column",
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#00112e",
  },
  warningSubtitle: {
    fontSize: 13,
    color: "#78350f",
    marginTop: 2,
    lineHeight: 18,
  },
  openSettingsButton: {
    backgroundColor: "#f26a0f",
    borderRadius: 12,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  openSettingsButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  toggleList: {
    flexDirection: "column",
    rowGap: 14,
  },
  toggleRow: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    columnGap: 14,
    paddingRight: 8,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  rowInfo: {
    flex: 1,
    flexDirection: "column",
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#00112e",
  },
  rowSubtitle: {
    fontSize: 12.5,
    color: "#64748b",
    marginTop: 2,
  },
});
