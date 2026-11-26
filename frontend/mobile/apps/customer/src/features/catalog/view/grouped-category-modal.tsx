import { Text } from "@vsolve/mobile-ui";
import { BlurView, type BlurViewProps } from "expo-blur";
import { Image, type ImageProps } from "expo-image";
import { LinearGradient, type LinearGradientProps } from "expo-linear-gradient";
import { ArrowRight, X } from "lucide-react-native";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CategoryArtwork } from "@/features/catalog/category-artwork";
import type { Category } from "@/features/catalog/client-queries";
import { HOME_REPAIR_GROUP } from "@/features/catalog/home-category-groups";

const ExpoImage = Image as unknown as (props: ImageProps) => React.JSX.Element;
const ExpoBlurView = BlurView as unknown as (props: BlurViewProps) => React.JSX.Element;
const ExpoLinearGradient = LinearGradient as unknown as (
  props: LinearGradientProps,
) => React.JSX.Element;
const repairsMaintenanceAsset = require("../../../../assets/catalog/tiles/repairs-maintenance.jpg");

type TradeCardTheme = {
  accentColor: string;
  iconBg: string;
  iconShadowColor: string;
  mobileArrowBg: string;
  fallbackDescription: string;
};

const TRADE_CARD_THEMES: Readonly<Record<string, TradeCardTheme>> = {
  technician: {
    accentColor: "#3642B8",
    iconBg: "#F4F3F1",
    iconShadowColor: "rgba(91, 99, 246, 0.26)",
    mobileArrowBg: "#EEF0FF",
    fallbackDescription: "Reviewed one-person Technician task visits.",
  },
  electrician: {
    accentColor: "#B84A0C",
    iconBg: "#FBF7F4",
    iconShadowColor: "rgba(249, 115, 22, 0.28)",
    mobileArrowBg: "#FFF3EA",
    fallbackDescription: "Wiring, fittings, fans and power faults, fixed in one visit.",
  },
  plumber: {
    accentColor: "#0C6E78",
    iconBg: "#F9F6F3",
    iconShadowColor: "rgba(13, 148, 136, 0.26)",
    mobileArrowBg: "#ECFAFB",
    fallbackDescription: "Taps, leaks, drains and fittings, fixed in one visit.",
  },
};

const DEFAULT_CARD_THEME: TradeCardTheme = {
  accentColor: "#00112e",
  iconBg: "#F8F9FA",
  iconShadowColor: "rgba(15, 23, 42, 0.16)",
  mobileArrowBg: "#F4F1EC",
  fallbackDescription: "Verified home repair and maintenance specialists.",
};

type NativeShadow = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

function platformShadow(boxShadow: string, native: NativeShadow) {
  return Platform.OS === "web" ? ({ boxShadow } as never) : native;
}

const MODAL_SHELL_SHADOW = platformShadow(
  "0 28px 70px -16px rgba(15, 23, 42, 0.22), 0 8px 24px -8px rgba(15, 23, 42, 0.08)",
  { shadowColor: "#0f172a", shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.18, shadowRadius: 32, elevation: 16 },
);

const CARD_SHADOW = platformShadow(
  "0 12px 30px -12px rgba(15, 23, 42, 0.09), 0 2px 8px -2px rgba(15, 23, 42, 0.04)",
  { shadowColor: "#0f172a", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
);

const CLOSE_BUTTON_SHADOW = platformShadow("0 4px 12px rgba(15, 23, 42, 0.06)", {
  shadowColor: "#0f172a",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 6,
  elevation: 2,
});

function SubtleBackdrop({ onPress }: { onPress: () => void }) {
  return (
    <>
      {Platform.OS === "web" ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: "rgba(15, 23, 42, 0.20)",
              backdropFilter: "blur(3px)",
              WebkitBackdropFilter: "blur(3px)",
            } as never,
          ]}
        />
      ) : (
        <>
          <ExpoBlurView intensity={12} tint="light" style={StyleSheet.absoluteFill} />
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(15, 23, 42, 0.20)" },
            ]}
          />
        </>
      )}
      <Pressable
        accessibilityLabel={`Close ${HOME_REPAIR_GROUP.title} backdrop`}
        onPress={onPress}
        style={StyleSheet.absoluteFill}
      />
    </>
  );
}

export function GroupedDesktopTile({
  members,
  onPress,
}: {
  members: readonly Category[];
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${HOME_REPAIR_GROUP.title}, ${members.length} services`}
      onPress={onPress}
      className="group flex-1 items-center gap-2.5 active:opacity-85"
    >
      <View className="relative aspect-square w-full overflow-hidden rounded-2xl border border-[#e7e2da] bg-[#F8F9FA] shadow-xs transition-transform duration-200 group-hover:scale-105">
        <ExpoImage
          source={repairsMaintenanceAsset}
          contentFit="cover"
          style={{ width: "100%", height: "100%" }}
        />
      </View>
      <View className="w-full px-0.5 lg:px-1">
        <Text className="w-full text-center text-[13.5px] font-bold leading-tight text-navy-900 xl:text-[15px]">
          {HOME_REPAIR_GROUP.title}
        </Text>
      </View>
    </Pressable>
  );
}

export function GroupedMobileTile({
  members,
  onPress,
}: {
  members: readonly Category[];
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${HOME_REPAIR_GROUP.title}, ${members.length} services`}
      onPress={onPress}
      className="w-full items-center gap-1.5 active:opacity-80"
    >
      <View className="relative aspect-square w-full overflow-hidden rounded-2xl border border-line/80 bg-[#F8F9FA] shadow-2xs">
        <ExpoImage
          source={repairsMaintenanceAsset}
          contentFit="cover"
          style={{ width: "100%", height: "100%" }}
        />
      </View>
      <Text className="w-full px-0.5 text-center text-[11px] font-bold leading-tight text-[#00112e] sm:text-xs">
        {HOME_REPAIR_GROUP.title}
      </Text>
    </Pressable>
  );
}

export function RepairsTradesModal({
  visible,
  members,
  isDesktop,
  onSelectCategory,
  onClose,
}: {
  visible: boolean;
  members: readonly Category[];
  isDesktop: boolean;
  onSelectCategory: (category: Category) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  if (!visible || members.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isDesktop ? "fade" : "slide"}
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View
        className={isDesktop ? "flex-1 items-center justify-center p-6" : "flex-1 justify-end"}
      >
        <SubtleBackdrop onPress={onClose} />

        <View
          style={[
            {
              width: "100%",
              maxWidth: isDesktop ? 896 : undefined,
              maxHeight: "85%",
              borderRadius: isDesktop ? 32 : undefined,
              borderTopLeftRadius: isDesktop ? 32 : 30,
              borderTopRightRadius: isDesktop ? 32 : 30,
              overflow: "hidden",
              borderWidth: isDesktop ? 1 : 0,
              borderTopWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.9)",
              backgroundColor: "#FFFFFF",
            },
            MODAL_SHELL_SHADOW,
          ]}
        >
          <ExpoLinearGradient
            colors={["#F4F6FD", "#FFFFFF", "#FDF4F3"]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              position: "relative",
              flexShrink: 1,
              paddingHorizontal: isDesktop ? 44 : 20,
              paddingTop: isDesktop ? 40 : 12,
              paddingBottom: isDesktop ? 40 : Math.max(24, insets.bottom + 12),
            }}
          >
            {/* Mobile drag handle */}
            {!isDesktop ? (
              <View className="mb-3.5 h-1 w-9 self-center rounded-full bg-[#D5DBE5]" />
            ) : null}

            {/* Top-right circular close button */}
            <Pressable
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={[
                {
                  position: "absolute",
                  top: isDesktop ? 28 : 20,
                  right: isDesktop ? 28 : 20,
                  zIndex: 10,
                  width: isDesktop ? 40 : 36,
                  height: isDesktop ? 40 : 36,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "#E6E8F0",
                  backgroundColor: "#FFFFFF",
                },
                CLOSE_BUTTON_SHADOW,
              ]}
            >
              <X size={16} color="#334155" strokeWidth={1.9} />
            </Pressable>

            {/* Clean header */}
            <View style={{ paddingRight: 48 }}>
              <Text
                className={
                  isDesktop
                    ? "text-[26px] font-extrabold leading-[32px] tracking-tight text-navy-900 lg:text-[28px]"
                    : "text-[20px] font-extrabold leading-[25px] tracking-tight text-navy-900"
                }
              >
                {HOME_REPAIR_GROUP.title}
              </Text>
              <Text
                className={
                  isDesktop
                    ? "mt-1.5 text-[15px] text-[#5A6270]"
                    : "mt-1 text-xs text-[#5A6270]"
                }
              >
                {HOME_REPAIR_GROUP.modalDescription}
              </Text>
            </View>

            {/* Cards: horizontal rows on mobile, 3-column elevated white cards on desktop */}
            <ScrollView
              style={{
                flexShrink: 1,
                marginTop: isDesktop ? 24 : 16,
                marginHorizontal: isDesktop ? -14 : -4,
                marginBottom: isDesktop ? -16 : 0,
              }}
              contentContainerStyle={{
                paddingTop: isDesktop ? 8 : 4,
                paddingBottom: isDesktop ? 16 : 8,
                paddingHorizontal: isDesktop ? 14 : 4,
              }}
              showsVerticalScrollIndicator={false}
            >
              <View className={isDesktop ? "flex-row gap-5" : "gap-3.5"}>
                {members.map((member) => {
                  const theme = TRADE_CARD_THEMES[member.slug] ?? DEFAULT_CARD_THEME;
                  const description = member.description?.trim() || theme.fallbackDescription;
                  const iconShadow = platformShadow(
                    `0 10px 22px -6px ${theme.iconShadowColor}, 0 2px 6px -1px rgba(15, 23, 42, 0.06)`,
                    { shadowColor: "#0f172a", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 3 },
                  );

                  if (!isDesktop) {
                    return (
                      <Pressable
                        key={member.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Explore ${member.name}`}
                        onPress={() => onSelectCategory(member)}
                        style={[
                          {
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 14,
                            borderRadius: 20,
                            borderWidth: 1,
                            borderColor: "rgba(15, 23, 42, 0.045)",
                            backgroundColor: "#FFFFFF",
                            padding: 14,
                          },
                          CARD_SHADOW,
                        ]}
                        className="active:opacity-90"
                      >
                        <View
                          style={[
                            {
                              width: 48,
                              height: 48,
                              borderRadius: 14,
                              overflow: "hidden",
                              backgroundColor: theme.iconBg,
                              borderWidth: 1,
                              borderColor: "rgba(15, 23, 42, 0.06)",
                            },
                            iconShadow,
                          ]}
                        >
                          <CategoryArtwork category={member} iconSize={22} />
                        </View>
                        <View className="min-w-0 flex-1">
                          <Text className="text-[15px] font-extrabold tracking-tight text-navy-900">
                            {member.name}
                          </Text>
                          <Text
                            numberOfLines={2}
                            className="mt-1 text-xs leading-snug text-[#5A6270]"
                          >
                            {description}
                          </Text>
                        </View>
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 999,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: theme.mobileArrowBg,
                          }}
                        >
                          <ArrowRight size={15} color={theme.accentColor} strokeWidth={2.2} />
                        </View>
                      </Pressable>
                    );
                  }

                  return (
                    <Pressable
                      key={member.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Explore ${member.name}`}
                      onPress={() => onSelectCategory(member)}
                      style={[
                        {
                          flex: 1,
                          justifyContent: "space-between",
                          borderRadius: 22,
                          borderWidth: 1,
                          borderColor: "rgba(15, 23, 42, 0.045)",
                          backgroundColor: "#FFFFFF",
                          padding: 28,
                        },
                        CARD_SHADOW,
                      ]}
                      className="transition-all duration-200 hover:-translate-y-1 active:opacity-90"
                    >
                      <View>
                        <View
                          style={[
                            {
                              width: 60,
                              height: 60,
                              borderRadius: 16,
                              overflow: "hidden",
                              backgroundColor: theme.iconBg,
                              borderWidth: 1,
                              borderColor: "rgba(15, 23, 42, 0.06)",
                            },
                            iconShadow,
                          ]}
                        >
                          <CategoryArtwork category={member} iconSize={24} />
                        </View>
                        <Text className="mt-6 text-[18px] font-extrabold tracking-tight text-navy-900">
                          {member.name}
                        </Text>
                        <Text className="mt-1.5 text-[13px] leading-[20px] text-[#5A6270]">
                          {description}
                        </Text>
                      </View>

                      <View className="mt-6 flex-row items-center gap-1.5">
                        <Text
                          style={{ color: theme.accentColor }}
                          className="text-[13px] font-bold"
                        >
                          Explore
                        </Text>
                        <ArrowRight size={14} color={theme.accentColor} strokeWidth={2.2} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </ExpoLinearGradient>
        </View>
      </View>
    </Modal>
  );
}
