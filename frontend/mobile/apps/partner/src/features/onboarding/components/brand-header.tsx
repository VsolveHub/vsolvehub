import { ArrowLeft, ChevronLeft } from "lucide-react-native";
import { Image, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const logoMark = require("@vsolve/mobile-ui/src/logo-mark.png");

export interface BrandHeaderProps {
  onBack?: () => void;
  showBack?: boolean;
  backVariant?: "chevron" | "arrow"; // "arrow" (←) is used on screens 10-12
  showAvatar?: boolean;
  partnerInitial?: string;
  onAvatarPress?: () => void;
  title?: string;
}

export function BrandHeader({
  onBack,
  showBack = false,
  backVariant = "chevron",
  showAvatar = true,
  partnerInitial = "W",
  onAvatarPress,
}: BrandHeaderProps) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === "ios" ? 48 : 24);

  return (
    <View style={[styles.container, { paddingTop: topInset + 6 }]}>
      <View style={styles.inner}>
        {/* Left: Back chevron / arrow or placeholder */}
        {showBack && onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            hitSlop={12}
            style={({ pressed }) => [styles.iconButton, pressed ? styles.iconButtonPressed : null]}
          >
            {backVariant === "arrow" ? (
              <ArrowLeft size={22} color="#00112e" strokeWidth={2.4} />
            ) : (
              <ChevronLeft size={24} color="#00112e" strokeWidth={2.4} />
            )}
          </Pressable>
        ) : (
          <View style={styles.placeholder} />
        )}

        {/* Center: VSolve Hub Logo */}
        <View style={styles.logoCenter}>
          <Image
            source={logoMark}
            style={styles.logoImage}
            resizeMode="contain"
            accessibilityLabel="VSolve Hub"
          />
          <Text style={styles.logoTextNavy}>
            VSolve <Text style={styles.logoTextOrange}>Hub</Text>
          </Text>
        </View>

        {/* Right: Avatar Badge */}
        {showAvatar ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Partner account menu"
            onPress={onAvatarPress}
            style={({ pressed }) => [styles.avatarBadge, pressed ? styles.avatarBadgePressed : null]}
          >
            <Text style={styles.avatarText}>{partnerInitial.toUpperCase()}</Text>
          </Pressable>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fffbf7",
    zIndex: 30,
  },
  inner: {
    width: "100%",
    maxWidth: 672,
    alignSelf: "center",
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 48,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonPressed: {
    backgroundColor: "#f1f5f9",
  },
  placeholder: {
    width: 38,
    height: 38,
  },
  logoCenter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 8,
  },
  logoImage: {
    width: 28,
    height: 28,
  },
  logoTextNavy: {
    fontSize: 18,
    fontWeight: "800",
    color: "#00112e",
    letterSpacing: -0.3,
  },
  logoTextOrange: {
    color: "#f26a0f",
  },
  avatarBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#ffe9d6",
    borderWidth: 1,
    borderColor: "#fed7aa",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBadgePressed: {
    backgroundColor: "#fed7aa",
  },
  avatarText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#f26a0f",
  },
});
