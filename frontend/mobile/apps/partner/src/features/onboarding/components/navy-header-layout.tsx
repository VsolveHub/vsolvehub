import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@vsolve/mobile-ui";

const logoMark = require("@vsolve/mobile-ui/src/logo-mark.png");

export interface NavyHeaderLayoutProps {
  title: string;
  subtitle: string;
  onBack?: () => void;
  children: ReactNode;
}

export function NavyHeaderLayout({
  title,
  subtitle,
  onBack,
  children,
}: NavyHeaderLayoutProps) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === "ios" ? 48 : 24);
  const bottomInset = Math.max(insets.bottom, Platform.OS === "ios" ? 34 : 16);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Navy Top Header Block */}
      <View style={[styles.navyHeader, { paddingTop: topInset + 6 }]}>
        <View style={styles.navyHeaderInner}>
          {/* Top Bar: Back Chevron + Logo */}
          <View style={styles.topNavRow}>
            {onBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={onBack}
                hitSlop={12}
                style={({ pressed }) => [styles.backButton, pressed ? { opacity: 0.7 } : null]}
              >
                <ChevronLeft size={24} color="#ffffff" strokeWidth={2.4} />
              </Pressable>
            ) : (
              <View style={styles.placeholder} />
            )}

            <View style={styles.logoCenter}>
              <Image
                source={logoMark}
                style={styles.logoImage}
                resizeMode="contain"
                accessibilityLabel="VSolve Hub"
              />
              <Text style={styles.logoTextWhite}>
                VSolve <Text style={styles.logoTextOrange}>Hub</Text>
              </Text>
            </View>

            <View style={styles.placeholder} />
          </View>

          {/* Title & Subtitle */}
          <View style={styles.titleBlock}>
            <Text style={styles.headerTitle}>{title}</Text>
            <Text style={styles.headerSubtitle}>{subtitle}</Text>
          </View>
        </View>
      </View>

      {/* Overlapping White Rounded Content Sheet */}
      <View style={styles.sheetContainer}>
        <ScrollView
          style={styles.sheetScrollView}
          contentContainerStyle={[
            styles.sheetContent,
            { paddingBottom: bottomInset + 32 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#00112e",
  },
  navyHeader: {
    backgroundColor: "#00112e",
    paddingBottom: 36,
  },
  navyHeaderInner: {
    width: "100%",
    maxWidth: 672,
    alignSelf: "center",
    paddingHorizontal: 20,
  },
  topNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 44,
  },
  backButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
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
    width: 26,
    height: 26,
  },
  logoTextWhite: {
    fontSize: 18,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.3,
  },
  logoTextOrange: {
    color: "#f26a0f",
  },
  titleBlock: {
    marginTop: 18,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#cbd5e1",
    marginTop: 6,
    lineHeight: 20,
  },
  sheetContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -16,
    overflow: "hidden",
  },
  sheetScrollView: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  sheetContent: {
    width: "100%",
    maxWidth: 672,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 24,
  },
});
