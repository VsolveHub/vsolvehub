import { Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

export function DesktopSiteFooter() {
  const router = useRouter();

  return (
    <View className="border-t border-[#D9D4CC] bg-[#E5E1DC] pb-12 pt-16">
      <View className="mx-auto w-full max-w-[1216px] px-6 lg:px-8">
        <View className="flex-row justify-between gap-8">
          {/* Brand Column */}
          <View className="w-1/4 gap-4">
            <Pressable accessibilityRole="link" onPress={() => router.push("/")} className="flex-row items-center gap-2">
              <Image source={require("../../../../assets/logo-mark.png")} style={{ width: 28, height: 28 }} contentFit="contain" />
              <Text className="text-lg font-extrabold tracking-tight text-navy-900">
                V Solve <Text className="text-lg font-extrabold text-[#EA580C]">Hub</Text>
              </Text>
            </Pressable>
            <Text className="mt-2 text-xs font-medium leading-relaxed text-navy-800">
              Professional home services you can trust. We bring expertise directly to your door.
            </Text>
          </View>

          {/* Company Column */}
          <View className="w-1/5 gap-4">
            <Text className="text-sm font-bold text-navy-900">Company</Text>
            <View className="gap-3">
              <Pressable accessibilityRole="button" onPress={() => router.push("/catalog")}>
                <Text className="text-xs font-medium text-navy-800 hover:text-action">Privacy Policy</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.push("/catalog")}>
                <Text className="text-xs font-medium text-navy-800 hover:text-action">Terms of Service</Text>
              </Pressable>
            </View>
          </View>

          {/* Support Column */}
          <View className="w-1/5 gap-4">
            <Text className="text-sm font-bold text-navy-900">Support</Text>
            <View className="gap-3">
              <Pressable accessibilityRole="button" onPress={() => router.push("/catalog")}>
                <Text className="text-xs font-medium text-navy-800 hover:text-action">Help Center</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.push("/catalog")}>
                <Text className="text-xs font-medium text-navy-800 hover:text-action">Contact Us</Text>
              </Pressable>
            </View>
          </View>

          {/* Partners Column */}
          <View className="w-1/5 gap-4">
            <Text className="text-sm font-bold text-navy-900">Partners</Text>
            <View className="gap-3">
              <Pressable accessibilityRole="button" onPress={() => router.push("/listings")}>
                <Text className="text-xs font-medium text-navy-800 hover:text-action">Become a Partner</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View className="mt-12 flex-row items-center justify-between border-t border-navy-900/10 pt-8">
          <Text className="text-xs font-medium text-navy-800/80">
            © {new Date().getFullYear()} V Solve Hub. All rights reserved.
          </Text>
        </View>
      </View>
    </View>
  );
}
