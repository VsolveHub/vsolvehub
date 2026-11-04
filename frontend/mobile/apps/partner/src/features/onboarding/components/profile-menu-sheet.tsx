import { Text } from "@vsolve/mobile-ui";
import { useMobileLogout } from "@vsolve/mobile-core";
import { useRouter } from "expo-router";
import {
  Bell,
  ChevronRight,
  ClipboardList,
  HelpCircle,
  LogOut,
  Trash2,
  User,
} from "lucide-react-native";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface ProfileMenuSheetProps {
  visible: boolean;
  onClose: () => void;
  partnerName?: string;
  partnerPhone?: string;
  partnerInitial?: string;
}

export function ProfileMenuSheet({
  visible,
  onClose,
  partnerName = "webaura",
  partnerPhone = "+91 98765 43210",
  partnerInitial,
}: ProfileMenuSheetProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const signOut = useMobileLogout("/login?next=%2Fapply");
  const bottomInset = Math.max(insets.bottom, Platform.OS === "ios" ? 34 : 16);

  const initial = (partnerInitial || partnerName.trim()[0] || "W").toUpperCase();

  const handleNavigate = (route: string) => {
    onClose();
    router.push(route as any);
  };

  const handleSignOut = async () => {
    onClose();
    await signOut();
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
          accessibilityLabel="Close menu"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.sheetCard, { paddingBottom: bottomInset + 16 }]}>
          {/* Grabber Handle */}
          <View style={styles.grabber} />

          {/* Header Row: Large Avatar + Name & Phone */}
          <View style={styles.headerRow}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarTextLarge}>{initial}</Text>
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.nameText}>{partnerName}</Text>
              <Text style={styles.phoneText}>{partnerPhone}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Menu Items List */}
          <View style={styles.menuList}>
            {/* 1. Profile */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Profile"
              onPress={() => handleNavigate("/me/profile")}
              style={({ pressed }) => [styles.menuItem, pressed ? styles.menuItemPressed : null]}
            >
              <View style={styles.menuItemLeft}>
                <User size={20} color="#0b1b3a" strokeWidth={2} />
                <Text style={styles.menuItemLabel}>Profile</Text>
              </View>
              <ChevronRight size={18} color="#94a3b8" />
            </Pressable>
            <View style={styles.rowDivider} />

            {/* 2. Application status */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Application status"
              onPress={() => handleNavigate("/apply/status")}
              style={({ pressed }) => [styles.menuItem, pressed ? styles.menuItemPressed : null]}
            >
              <View style={styles.menuItemLeft}>
                <ClipboardList size={20} color="#0b1b3a" strokeWidth={2} />
                <Text style={styles.menuItemLabel}>Application status</Text>
              </View>
              <ChevronRight size={18} color="#94a3b8" />
            </Pressable>
            <View style={styles.rowDivider} />

            {/* 3. Notifications */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => handleNavigate("/me/notifications")}
              style={({ pressed }) => [styles.menuItem, pressed ? styles.menuItemPressed : null]}
            >
              <View style={styles.menuItemLeft}>
                <Bell size={20} color="#0b1b3a" strokeWidth={2} />
                <Text style={styles.menuItemLabel}>Notifications</Text>
              </View>
              <ChevronRight size={18} color="#94a3b8" />
            </Pressable>
            <View style={styles.rowDivider} />

            {/* 4. Help & support */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Help & support"
              onPress={() => handleNavigate("/help")}
              style={({ pressed }) => [styles.menuItem, pressed ? styles.menuItemPressed : null]}
            >
              <View style={styles.menuItemLeft}>
                <HelpCircle size={20} color="#0b1b3a" strokeWidth={2} />
                <Text style={styles.menuItemLabel}>Help & support</Text>
              </View>
              <ChevronRight size={18} color="#94a3b8" />
            </Pressable>
            <View style={styles.rowDivider} />

            {/* 5. Delete account */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete account"
              onPress={() => handleNavigate("/me/delete-account")}
              style={({ pressed }) => [styles.menuItem, pressed ? styles.menuItemPressed : null]}
            >
              <View style={styles.menuItemLeft}>
                <Trash2 size={20} color="#dc2626" strokeWidth={2} />
                <Text style={[styles.menuItemLabel, { color: "#dc2626" }]}>Delete account</Text>
              </View>
              <ChevronRight size={18} color="#94a3b8" />
            </Pressable>
            <View style={styles.rowDivider} />

            {/* 6. Sign out */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              onPress={handleSignOut}
              style={({ pressed }) => [styles.menuItem, pressed ? styles.menuItemPressed : null]}
            >
              <View style={styles.menuItemLeft}>
                <LogOut size={20} color="#64748b" strokeWidth={2} />
                <Text style={[styles.menuItemLabel, { color: "#475569" }]}>Sign out</Text>
              </View>
              <ChevronRight size={18} color="#94a3b8" />
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
    alignSelf: "center",
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 16,
    paddingBottom: 16,
  },
  avatarLarge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#ffe9d6",
    borderWidth: 1.5,
    borderColor: "#fed7aa",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTextLarge: {
    fontSize: 22,
    fontWeight: "800",
    color: "#f26a0f",
  },
  headerInfo: {
    flexDirection: "column",
  },
  nameText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0b1b3a",
  },
  phoneText: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#f1f5f9",
    marginBottom: 8,
  },
  menuList: {
    flexDirection: "column",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  menuItemPressed: {
    opacity: 0.65,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 14,
  },
  menuItemLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0b1b3a",
  },
  rowDivider: {
    height: 1,
    backgroundColor: "#f8fafc",
  },
});
