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
import { useCallback, useRef } from "react";
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
  /**
   * Opens the notifications panel in place, as the website does. Without it the row goes to the
   * notifications page, which only an approved Partner can open.
   */
  onOpenNotifications?: () => void;
  /**
   * Opens the "Need help?" sheet over the application, as the website does. Without it the row
   * goes to the full help page.
   */
  onOpenHelp?: () => void;
  /**
   * Opens the "Delete your account?" confirmation over the application, as the website does.
   * Without it the row goes to the full delete page.
   */
  onOpenDelete?: () => void;
  /** Already worded, e.g. "Your account will be deleted on 12 Dec 2026." */
  deletionNote?: string | null;
}

export function ProfileMenuSheet({
  visible,
  onClose,
  partnerName,
  partnerPhone,
  partnerInitial,
  onOpenNotifications,
  onOpenHelp,
  onOpenDelete,
  deletionNote,
}: ProfileMenuSheetProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const signOut = useMobileLogout("/login?next=%2Fapply");
  const bottomInset = Math.max(insets.bottom, Platform.OS === "ios" ? 34 : 16);

  const name = partnerName?.trim() || "Your account";
  // The letter comes from a real name only. "Your account" is a label, not a name, so its "Y"
  // must never become the avatar.
  const initial = (partnerInitial || partnerName?.trim()[0] || "").toUpperCase();

  /**
   * Runs `action` once the sheet has finished closing.
   *
   * The sheet is a native `Modal`. On iOS a native screen push (`/help`, `/delete-account`) or a
   * root replace (sign out) made while that modal is still dismissing is silently dropped, so the
   * tap looks dead. "Application status" only worked because `/apply/*` swaps content inside the
   * apply layout instead of pushing a native screen. iOS reports the end of the dismissal through
   * `onDismiss`; a timer covers the case where it never arrives. Android has no such limit.
   */
  const pendingAction = useRef<(() => void) | null>(null);
  const runPending = useCallback(() => {
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
  }, []);
  const afterClose = (action: () => void) => {
    onClose();
    if (Platform.OS !== "ios") {
      action();
      return;
    }
    pendingAction.current = action;
    setTimeout(runPending, 700);
  };

  // These sheets are only opened from the onboarding shell, so every row must lead somewhere an
  // applicant can open: `/me/*` is for approved Partners, and the partner guard turns anyone else
  // back to `/apply`, which made Profile, Notifications and Delete account look dead.
  const handleNavigate = (route: string) => {
    afterClose(() => router.push(route as any));
  };

  const handleNotifications = () => {
    if (!onOpenNotifications) {
      handleNavigate("/me/notifications");
      return;
    }
    afterClose(onOpenNotifications);
  };

  const handleHelp = () => {
    if (!onOpenHelp) {
      handleNavigate("/help");
      return;
    }
    afterClose(onOpenHelp);
  };

  const handleDelete = () => {
    if (!onOpenDelete) {
      handleNavigate("/delete-account");
      return;
    }
    afterClose(onOpenDelete);
  };

  const handleSignOut = () => {
    afterClose(() => void signOut());
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={runPending}
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
              {initial ? (
                <Text style={styles.avatarTextLarge}>{initial}</Text>
              ) : (
                <User size={26} color="#f26a0f" strokeWidth={2.2} />
              )}
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.nameText}>{name}</Text>
              {partnerPhone ? <Text style={styles.phoneText}>{partnerPhone}</Text> : null}
            </View>
          </View>

          <View style={styles.divider} />

          {/* Menu Items List */}
          <View style={styles.menuList}>
            {/* 1. Profile */}
            <Pressable
              cssInterop={false}
              accessibilityRole="button"
              accessibilityLabel="Profile"
              onPress={() => handleNavigate("/apply/profile")}
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
              cssInterop={false}
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
              cssInterop={false}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={handleNotifications}
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
              cssInterop={false}
              accessibilityRole="button"
              accessibilityLabel="Help & support"
              onPress={handleHelp}
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
              cssInterop={false}
              accessibilityRole="button"
              accessibilityLabel="Delete account"
              onPress={handleDelete}
              style={({ pressed }) => [styles.menuItem, pressed ? styles.menuItemPressed : null]}
            >
              <View style={styles.menuItemLeft}>
                <Trash2 size={20} color="#dc2626" strokeWidth={2} />
                <Text style={[styles.menuItemLabel, { color: "#dc2626" }]}>Delete account</Text>
              </View>
              <ChevronRight size={18} color="#94a3b8" />
            </Pressable>
            {deletionNote ? <Text style={styles.deletionNote}>{deletionNote}</Text> : null}
            <View style={styles.rowDivider} />

            {/* 6. Sign out */}
            <Pressable
              cssInterop={false}
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
  deletionNote: {
    fontSize: 12,
    lineHeight: 17,
    color: "#6b7280",
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  rowDivider: {
    height: 1,
    backgroundColor: "#f8fafc",
  },
});
