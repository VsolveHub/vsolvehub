// Ported from frontend/apps/customer/features/session/view/site-header.tsx (BottomNav)
import { useAuthStore } from "@vsolve/mobile-core";
import { Text } from "@vsolve/mobile-ui";
import { usePathname, useRouter } from "expo-router";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg";

import { isCustomerTabActive } from "../navigation";

export type TabIconType = "home" | "search" | "activity" | "login" | "profile";

export interface MobileNavTarget {
  href: string | null;
  label: string;
  shortLabel: string;
  icon: TabIconType;
  private: boolean;
}

export function CustomerBottomNav({
  onLoginPress,
  onBookingsPress,
}: {
  onLoginPress?: () => void;
  onBookingsPress?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const status = useAuthStore((state) => state.status);

  const targets: MobileNavTarget[] = [
    { href: "/", label: "Home", shortLabel: "Home", icon: "home", private: false },
    { href: "/catalog", label: "Services", shortLabel: "Services", icon: "search", private: false },
    { href: "/activity", label: "Bookings", shortLabel: "Bookings", icon: "activity", private: false },
    status === "signedIn"
      ? { href: "/account", label: "Profile", shortLabel: "Profile", icon: "profile", private: true }
      : { href: null, label: "Log in", shortLabel: "Log in", icon: "login", private: false },
  ];

  const handlePress = (target: MobileNavTarget) => {
    if (target.label === "Bookings") {
      if (status === "signedIn") {
        router.push("/activity");
      } else if (onBookingsPress) {
        onBookingsPress();
      } else {
        if (pathname === "/login") return;
        router.push("/login?next=/activity");
      }
      return;
    }

    if (target.label === "Log in") {
      if (pathname === "/login") return;
      if (onLoginPress) {
        onLoginPress();
      } else {
        router.push("/login");
      }
      return;
    }

    if (target.href) {
      router.push(target.href as never);
    }
  };

  return (
    <View
      className="w-full border-t border-[#E7E2DA]/80 bg-[#FAF9F7]"
      style={{
        paddingTop: 8,
        paddingBottom: Math.max(8, insets.bottom),
        paddingHorizontal: 4,
        minHeight: 64,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
        elevation: 8,
      }}
    >
      <View className="flex-row w-full items-center justify-around">
        {targets.map((target) => {
          const active = target.href ? isCustomerTabActive(target.href, pathname) : false;
          const iconColor = active ? "#ffffff" : "#453F37";

          return (
            <Pressable
              key={target.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={target.label}
              onPress={() => handlePress(target)}
              className="flex-1 items-center justify-center py-0.5"
              style={{ gap: 4, minWidth: 0 }}
            >
              <View
                className="items-center justify-center"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: active ? "#f87000" : "transparent",
                  ...(active
                    ? {
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.12,
                        shadowRadius: 2,
                        elevation: 2,
                      }
                    : {}),
                }}
              >
                <NavIconMobile name={target.icon} color={iconColor} />
              </View>
              <Text
                style={{
                  fontSize: 10,
                  lineHeight: 12,
                  fontFamily: active
                    ? Platform.select({ ios: "PlusJakartaSans-Bold", default: "PlusJakartaSans_700Bold" })
                    : Platform.select({ ios: "PlusJakartaSans-SemiBold", default: "PlusJakartaSans_600SemiBold" }),
                  fontWeight: active ? "700" : "600",
                  color: active ? "#f87000" : "#453F37",
                }}
                numberOfLines={1}
              >
                {target.shortLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function NavIconMobile({ name, color }: { name: TabIconType; color: string }) {
  if (name === "home") {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Polyline
          points="9 22 9 12 15 12 15 22"
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  if (name === "search") {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Circle
          cx={11}
          cy={11}
          r={8}
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="m21 21-4.3-4.3"
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  if (name === "activity") {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Rect
          x={3}
          y={4}
          width={18}
          height={18}
          rx={2}
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Line x1={16} x2={16} y1={2} y2={6} stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Line x1={8} x2={8} y1={2} y2={6} stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Line x1={3} x2={21} y1={10} y2={10} stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }

  if (name === "login") {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M10 16l4-4-4-4M14 12H3.5"
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle
        cx={12}
        cy={7}
        r={4}
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
