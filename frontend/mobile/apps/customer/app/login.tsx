// Upgraded standalone login screen with full VSolveHub branding, safe-area top padding, and back navigation
import { safeNextPath } from "@vsolve/query/native";
import { useAuthStore, useMobileOtpFlow } from "@vsolve/mobile-core";
import { Text } from "@vsolve/mobile-ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { CustomerLoginExperience } from "@/features/session/view/customer-login-experience";

function BackArrowIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#00112e" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m15 18-6-6 6-6" />
    </Svg>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ next?: string }>();
  const status = useAuthStore((state) => state.status);
  const flow = useMobileOtpFlow();
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);

  useEffect(() => {
    if (status !== "signedIn") return;
    router.replace((next ?? "/") as never);
  }, [next, router, status]);

  if (status === "loading" || status === "signedIn") {
    return (
      <View className="flex-1 items-center justify-center bg-[#FAF9F7] px-4">
        <Text className="text-text-secondary">
          {status === "signedIn" ? "Taking you to V Solve Hub…" : "Checking your session…"}
        </Text>
      </View>
    );
  }

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    setRefreshing(false);
  };

  return (
    <View className="flex-1 bg-[#FAF9F7]">
      {/* Top Navigation Bar with Back to Home */}
      <View
        style={{ paddingTop: Math.max(insets.top, 24) + 8 }}
        className="flex-row items-center justify-between border-b border-line/60 bg-[#FAF9F7] px-4 pb-3"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/");
            }
          }}
          className="flex-row items-center gap-2 py-1 pr-3"
        >
          <View className="size-8 items-center justify-center rounded-full bg-surface shadow-2xs">
            <BackArrowIcon />
          </View>
          <Text className="text-sm font-bold text-navy-900">Back</Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 py-6 items-center"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#EA580C"]}
            tintColor="#EA580C"
          />
        }
      >
        <CustomerLoginExperience
          flow={flow}
          variant="page"
          mobileFocused
          onClose={() => router.replace("/")}
          onBrowseServices={() => router.push("/catalog" as never)}
        />
      </ScrollView>
    </View>
  );
}
