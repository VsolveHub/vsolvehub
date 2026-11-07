import { Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SeekerProfileForm } from "@/features/listings/view/seeker-profile-form";

export default function JobProfilePage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-canvas px-4 pb-8"
      style={{ paddingTop: Math.max(insets.top + 16, 38) }}
    >
      <View className="flex-row items-center justify-between border-b border-line pb-3">
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/listings" as never);
            }
          }}
          className="flex-row items-center gap-1.5"
        >
          <ArrowLeft size={16} color="#00112e" />
          <Text className="text-sm font-bold text-navy-900">Job Board</Text>
        </Pressable>
      </View>

      <View className="my-3 gap-1">
        <Text className="text-2xl font-black text-navy-900">Your Job Profile</Text>
        <Text className="text-xs text-text-secondary">
          Fill your details once to apply for opportunities in a single tap
        </Text>
      </View>

      <SeekerProfileForm />
    </View>
  );
}
