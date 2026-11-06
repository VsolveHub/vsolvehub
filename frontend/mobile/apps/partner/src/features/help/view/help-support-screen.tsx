import { Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";

import { openSupportCall, openSupportEmail } from "@/features/support/contact";
import {
  ChevronRight,
  HelpCircle,
  Mail,
  MessageCircle,
  Phone,
  Users,
} from "lucide-react-native";
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { NavyHeaderLayout } from "@/features/onboarding/components/navy-header-layout";

export function HelpSupportScreen() {
  const router = useRouter();

  const handleOpenUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      // url fallback
    }
  };

  return (
    <NavyHeaderLayout
      title="How can we help?"
      subtitle="Get in touch with our team or find answers to common questions."
      onBack={() => router.back()}
    >
      <View style={styles.container}>
        {/* 4 Contact Rows matching Screen 14 */}
        <View style={styles.rowsContainer}>
          {/* Row 1: WhatsApp */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chat on WhatsApp"
            onPress={() => handleOpenUrl("https://wa.me/918008765832")}
            style={({ pressed }) => [styles.rowCard, pressed ? styles.rowCardPressed : null]}
          >
            <View style={styles.rowLeft}>
              <View style={styles.whatsappIconBox}>
                <MessageCircle size={20} color="#16a34a" strokeWidth={2.4} />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Chat on WhatsApp</Text>
                <Text style={styles.rowSubtitle}>Get quick answers</Text>
              </View>
            </View>
            <ChevronRight size={18} color="#94a3b8" />
          </Pressable>

          {/* Row 2: Call support */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Call support"
            onPress={openSupportCall}
            style={({ pressed }) => [styles.rowCard, pressed ? styles.rowCardPressed : null]}
          >
            <View style={styles.rowLeft}>
              <View style={styles.slateIconBox}>
                <Phone size={18} color="#00112e" strokeWidth={2.2} />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Call support</Text>
                <Text style={styles.rowSubtitle}>Speak to our team</Text>
              </View>
            </View>
            <ChevronRight size={18} color="#94a3b8" />
          </Pressable>

          {/* Row 3: Email us */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Email us"
            onPress={() => openSupportEmail()}
            style={({ pressed }) => [styles.rowCard, pressed ? styles.rowCardPressed : null]}
          >
            <View style={styles.rowLeft}>
              <View style={styles.slateIconBox}>
                <Mail size={18} color="#00112e" strokeWidth={2.2} />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Email us</Text>
                <Text style={styles.rowSubtitle}>We usually reply within 24 hours</Text>
              </View>
            </View>
            <ChevronRight size={18} color="#94a3b8" />
          </Pressable>

          {/* Row 4: FAQs */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="FAQs"
            onPress={() => handleOpenUrl("https://vsolvehub.com/faqs")}
            style={({ pressed }) => [styles.rowCard, pressed ? styles.rowCardPressed : null]}
          >
            <View style={styles.rowLeft}>
              <View style={styles.slateIconBox}>
                <HelpCircle size={18} color="#00112e" strokeWidth={2.2} />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>FAQs</Text>
                <Text style={styles.rowSubtitle}>Browse common questions</Text>
              </View>
            </View>
            <ChevronRight size={18} color="#94a3b8" />
          </Pressable>
        </View>

        {/* Bottom Info Card matching Screen 14 */}
        <View style={styles.bottomInfoCard}>
          <View style={styles.bottomIconCircle}>
            <Users size={22} color="#00112e" strokeWidth={2} />
          </View>
          <View style={styles.bottomInfoText}>
            <Text style={styles.bottomTitle}>We're here to help</Text>
            <Text style={styles.bottomSubtitle}>Real people. Real support.</Text>
            <Text style={styles.bottomHours}>Monday – Friday, 9am – 6pm.</Text>
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
  rowsContainer: {
    flexDirection: "column",
    rowGap: 12,
    marginBottom: 20,
  },
  rowCard: {
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
  rowCardPressed: {
    backgroundColor: "#f8fafc",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 14,
    flex: 1,
  },
  whatsappIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
  },
  slateIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  rowInfo: {
    flexDirection: "column",
    flex: 1,
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
  bottomInfoCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    columnGap: 14,
    marginTop: 4,
  },
  bottomIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomInfoText: {
    flex: 1,
    flexDirection: "column",
  },
  bottomTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#00112e",
  },
  bottomSubtitle: {
    fontSize: 13,
    color: "#475569",
    marginTop: 2,
  },
  bottomHours: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
});
