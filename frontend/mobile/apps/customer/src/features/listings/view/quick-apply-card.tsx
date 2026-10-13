import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Button, Text } from "@vsolve/mobile-ui";
import { AlertCircle, CheckCircle2, FileText, UserCheck } from "lucide-react-native";
import { isApiRequestError } from "@vsolve/api-client";

import { quickApply, type JobProfile } from "../seeker-queries";

const PRESET_NOTES = [
  "I am interested in this job and can join soon.",
  "I have relevant experience for this role.",
  "I live nearby and can start immediately.",
];

export function QuickApplyCard({
  listingId,
  posterName,
  profile,
}: {
  listingId: string;
  posterName?: string;
  profile: JobProfile;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);

  const applyMutation = useMutation({
    mutationFn: () => quickApply(listingId, note.trim()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-listing-applications"] });
      void qc.invalidateQueries({ queryKey: ["listing"] });
    },
    onError: (err: any) => {
      const duplicate =
        (isApiRequestError(err) && (err.code === "application_duplicate" || err.status === 409)) ||
        err?.status === 409 ||
        err?.code === "application_duplicate" ||
        (typeof err?.message === "string" &&
          (err.message.toLowerCase().includes("already applied") ||
            err.message.toLowerCase().includes("duplicate")));

      void qc.invalidateQueries({ queryKey: ["my-listing-applications"] });
      void qc.invalidateQueries({ queryKey: ["listing"] });

      if (duplicate) {
        setIsDuplicate(true);
      }
      setErrorMsg(err?.message || "Failed to submit quick application.");
    },
  });

  if (applyMutation.isSuccess) {
    return (
      <View className="rounded-2xl border border-emerald-500/30 bg-emerald-50/50 p-5 items-center text-center">
        <CheckCircle2 size={36} color="#059669" />
        <Text className="mt-2 text-base font-extrabold text-emerald-950">Application sent</Text>
        <Text className="mt-1 text-xs text-center text-emerald-800">
          {posterName || "The employer"} has your profile. {"You'll be notified when they shortlist you."}
        </Text>
        <Button
          variant="primary"
          size="md"
          onPress={() => router.push("/listings/my-applications" as never)}
          className="mt-4 w-full"
        >
          Track in My Applications →
        </Button>
      </View>
    );
  }

  if (isDuplicate) {
    return (
      <View className="rounded-2xl border border-amber-500/30 bg-amber-50/50 p-5 items-center text-center">
        <AlertCircle size={36} color="#d97706" />
        <Text className="mt-2 text-base font-extrabold text-amber-950">Already Applied</Text>
        <Text className="mt-1 text-xs text-center text-amber-800">
          You have already submitted an application for this role. Track your progress under My Applications.
        </Text>
        <Button
          variant="primary"
          size="md"
          onPress={() => router.push("/listings/my-applications" as never)}
          className="mt-4 w-full"
        >
          Track in My Applications →
        </Button>
      </View>
    );
  }

  const roleText = (profile.roles || []).join(", ");
  const locationText = [profile.area, profile.city].filter(Boolean).join(", ");

  return (
    <View className="rounded-2xl border border-line bg-surface p-4 gap-3 shadow-xs">
      <View className="flex-row items-center gap-2">
        <UserCheck size={18} color="#f87000" />
        <View className="flex-1">
          <Text className="text-sm font-extrabold text-navy-900">
            Apply with your V Solve Hub profile
          </Text>
          <Text className="text-[11px] text-text-secondary">No forms to fill again.</Text>
        </View>
      </View>

      <View className="rounded-xl border border-line bg-canvas p-3">
        <Text className="text-xs font-bold text-navy-900">{profile.full_name || profile.name}</Text>
        <Text className="text-[11px] text-text-secondary mt-0.5">
          {[roleText, locationText].filter(Boolean).join(" · ")}
        </Text>
        {profile.resume_name ? (
          <View className="mt-1.5 flex-row items-center gap-1">
            <FileText size={12} color="#6B6560" />
            <Text className="text-[10px] text-text-muted">{profile.resume_name}</Text>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/listings/profile" as never)}
          className="mt-2 self-start"
        >
          <Text className="text-[11px] font-bold text-brand">Edit profile →</Text>
        </Pressable>
      </View>

      <View className="gap-2">
        <Text className="text-xs font-semibold text-text">Message (optional)</Text>
        <View className="flex-row flex-wrap gap-1.5">
          {PRESET_NOTES.map((n) => (
            <Pressable
              key={n}
              accessibilityRole="button"
              onPress={() => setNote(n)}
              className="rounded-full border border-line bg-canvas px-3 py-1 active:bg-brand/10"
            >
              <Text className="text-[11px] text-text-secondary">{n}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          multiline
          numberOfLines={2}
          maxLength={2000}
          value={note}
          onChangeText={setNote}
          placeholder="Or write your own note..."
          placeholderTextColor="rgba(107,101,96,0.6)"
          className="min-h-16 rounded-xl border border-line bg-canvas p-2.5 text-xs text-text"
        />
      </View>

      {errorMsg ? (
        <Text className="text-xs font-semibold text-danger-text">{errorMsg}</Text>
      ) : null}

      <Button
        variant="primary"
        size="lg"
        onPress={() => applyMutation.mutate()}
        disabled={applyMutation.isPending}
        className="w-full"
      >
        {applyMutation.isPending ? "Sending application..." : "Apply now with 1-tap"}
      </Button>

      <Text className="text-[10px] text-text-muted text-center">
        Your name, phone and profile are shared directly with this employer.
      </Text>
    </View>
  );
}
