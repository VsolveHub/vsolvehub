import { Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { Lock, MapPin, Phone } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandHeader } from "@/features/onboarding/components/brand-header";
import { ProfileMenuSheet } from "@/features/onboarding/components/profile-menu-sheet";
import { usePartnerProfile, useUpdatePartnerProfile } from "../queries";

export function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const bottomInset = Math.max(insets.bottom, Platform.OS === "ios" ? 34 : 16);

  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const profileQuery = usePartnerProfile();

  // The owner decided against a name-change feature, and `/partner/me` ignores the field: this
  // screen shows what is on record, and support changes it.
  const name = profileQuery.data?.display_name?.trim() ?? "";
  const partnerPhone = profileQuery.data?.phone_number ?? "";
  const initial = name[0]?.toUpperCase() ?? "";

  return (
    <View style={styles.root}>
      {/* Brand Header with long-arrow (←) matching Screen 12 */}
      <BrandHeader
        showBack
        backVariant="arrow"
        onBack={() => router.back()}
        onAvatarPress={() => setProfileModalOpen(true)}
        partnerInitial={initial}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            maxWidth: isDesktop ? 672 : "100%",
            paddingBottom: bottomInset + 88,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text style={styles.screenTitle}>Profile</Text>

        {/* Card 1: Editable Full Name & Bio */}
        <View style={styles.card}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full name</Text>
            <Text style={styles.lockedValue}>{name || "Not added yet"}</Text>
            <Text style={styles.charCounter}>To change this, contact support.</Text>
          </View>
        </View>

        {/* Card 2: Locked Phone */}
        <View style={styles.lockedCard}>
          <View style={styles.lockedRow}>
            <View style={styles.lockedIconWrapper}>
              <Phone size={18} color="#00112e" strokeWidth={2.2} />
            </View>
            <Text style={styles.lockedLabel}>Phone</Text>
            <Text style={styles.lockedValue}>{partnerPhone}</Text>
          </View>
          <View style={styles.lockedBadge}>
            <Lock size={12} color="#64748b" strokeWidth={2.2} style={{ marginRight: 4 }} />
            <Text style={styles.lockedBadgeText}>Locked after submission</Text>
          </View>
        </View>

      </ScrollView>

      {/* Screen 11: Profile Menu Bottom Sheet */}
      <ProfileMenuSheet
        visible={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        partnerName={name}
        partnerPhone={partnerPhone}
        partnerInitial={initial}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fbfaf8",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    width: "100%",
    alignSelf: "center",
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#00112e",
    letterSpacing: -0.5,
    marginBottom: 20,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 18,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  inputGroup: {
    flexDirection: "column",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#00112e",
    marginBottom: 8,
  },
  requiredAsterisk: {
    color: "#ea580c",
  },
  textInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#00112e",
  },
  textArea: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#00112e",
    minHeight: 90,
  },
  charCounter: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "right",
    marginTop: 6,
  },
  lockedCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    marginBottom: 12,
    flexDirection: "column",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  lockedRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  lockedIconWrapper: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  lockedLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#00112e",
    marginLeft: 6,
  },
  lockedValue: {
    fontSize: 15,
    color: "#334155",
    fontWeight: "600",
    marginLeft: "auto",
  },
  lockedBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 10,
    marginLeft: 34,
  },
  lockedBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  successBanner: {
    backgroundColor: "#ecfdf5",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    padding: 12,
    marginTop: 8,
    alignItems: "center",
  },
  successBannerText: {
    color: "#059669",
    fontSize: 14,
    fontWeight: "600",
  },
  dockContainer: {
    position: Platform.OS === "web" ? ("fixed" as any) : "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderColor: "#f1f5f9",
    paddingHorizontal: 20,
    paddingTop: 12,
    zIndex: 40,
  },
  dockInner: {
    width: "100%",
    alignSelf: "center",
  },
  saveButton: {
    backgroundColor: "#f26a0f",
    borderRadius: 14,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
