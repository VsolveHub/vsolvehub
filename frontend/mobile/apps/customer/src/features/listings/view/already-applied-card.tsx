import { useRouter } from "expo-router";
import { CheckCircle2, FileCheck2 } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@vsolve/mobile-ui";

import { APPLICATION_STATUS_LABELS } from "../model";

export interface AlreadyAppliedCardProps {
  posterName?: string;
  status?: string;
}

export function AlreadyAppliedCard({ posterName, status }: AlreadyAppliedCardProps) {
  const router = useRouter();
  const label = APPLICATION_STATUS_LABELS[status ?? ""] ?? status ?? "Submitted";

  return (
    <View className="rounded-2xl border border-navy-200 bg-[#f7f9fe] p-5 items-center text-center">
      <CheckCircle2 size={32} color="#00112e" />
      <Text className="mt-2 text-sm font-bold text-navy-900">
        You have already applied
      </Text>
      <View className="mt-1 flex-row flex-wrap items-center justify-center gap-1">
        <Text className="text-xs text-text-secondary">
          Your application for this role is
        </Text>
        <View className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5">
          <Text className="text-xs font-bold text-navy-800">{label}</Text>
        </View>
        <Text className="text-xs text-text-secondary">
          . {posterName || "The employer"} can now review it.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/listings/my-applications" as never)}
        className="mt-4 w-full flex-row items-center justify-center gap-2 rounded-xl bg-navy-900 py-3 active:bg-navy-800"
      >
        <FileCheck2 size={16} color="#ffffff" />
        <Text className="text-xs font-bold text-white">Track it in My Applications</Text>
      </Pressable>
      <Text className="mt-2 text-[11px] text-text-muted text-center">
        One application per listing. You can withdraw it from My Applications.
      </Text>
    </View>
  );
}
