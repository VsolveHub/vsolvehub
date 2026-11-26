import { Button, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";


export function DocumentsScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const content = (
    <>

      {/* No document records exist on the server yet: say so plainly instead of
          showing invented "verified" records or a pretend upload. */}
      <View className="items-center rounded-2xl border border-[#F1EFEB] bg-white p-6 shadow-xs">
        <View className="mb-3 size-12 items-center justify-center rounded-full bg-[#FFF6ED]">
          <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#EA580C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <Path d="M14 2v6h6" />
          </Svg>
        </View>
        <Text className="text-center text-base font-bold text-[#0F172A]">No documents yet</Text>
        <Text className="mt-1 max-w-[280px] text-center text-sm leading-relaxed text-[#64748B]">
          You don&apos;t need to upload any documents to book services. Invoices for completed bookings are on each booking&apos;s receipt.
        </Text>
        <Button onPress={() => router.push("/bookings" as never)} className="mt-4 bg-[#EA580C] px-6">
          View my bookings
        </Button>
      </View>
    </>
  );

  if (embedded) {
    return <View className="gap-5">{content}</View>;
  }

  return (
    <ScrollView
      className="flex-1 bg-[#FAF9F7]"
      style={{ paddingTop: Math.max(insets.top, 20) }}
      contentContainerClassName="px-4 pb-24 pt-2 gap-4"
      showsVerticalScrollIndicator={false}
    >
      {/* Header with Back Button */}
      <View className="flex-row items-center gap-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Profile"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/account");
            }
          }}
          className="size-9 items-center justify-center rounded-full border border-[#E5E7EB] bg-white shadow-2xs active:bg-[#F2EFE9]"
        >
          <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#0F172A" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="m15 18-6-6 6-6" />
          </Svg>
        </Pressable>

        <View className="flex-1 min-w-0">
          <Text className="text-2xl font-extrabold text-[#0B1B3D]">Your documents</Text>
          <Text className="text-xs text-[#64748B]">ID and invoice records</Text>
        </View>
      </View>

      {content}
    </ScrollView>
  );
}
