import { useState } from "react";
import { Alert, Linking, TextInput, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Text } from "@vsolve/mobile-ui";
import {
  Calendar,
  CheckCircle2,
  MapPin,
  Phone,
} from "lucide-react-native";

import type { ListingApplication } from "../queries";
import { answerInterview, HIRING_STEP_LABELS } from "../seeker-queries";

const STEPS = ["Applied", "Shortlisted", "Interview", "Connected"] as const;

function stepIndex(status: string): number {
  const label = HIRING_STEP_LABELS[status] ?? "";
  if (label === "Under review") return 0;
  return STEPS.indexOf(label as (typeof STEPS)[number]);
}

export function HiringProgress({ app }: { app: ListingApplication }) {
  const qc = useQueryClient();
  const [asking, setAsking] = useState<null | "reschedule" | "decline">(null);
  const [note, setNote] = useState("");

  const interview = app.interview;

  const answer = useMutation({
    mutationFn: (action: "accept" | "reschedule" | "decline") =>
      answerInterview(interview!.id, action, note.trim()),
    onSuccess: (_, action) => {
      setAsking(null);
      setNote("");
      void qc.invalidateQueries({ queryKey: ["my-listing-applications"] });
      Alert.alert(
        "Response Sent",
        action === "accept"
          ? "You accepted the interview invitation."
          : action === "reschedule"
            ? "Your reschedule request has been sent to the employer."
            : "Interview declined.",
      );
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "Failed to update interview.");
    },
  });

  const current = stepIndex(app.status);
  const closed = ["REJECTED", "WITHDRAWN", "EXPIRED"].includes(app.status);
  const connected = app.status === "CONNECTED" || app.status === "CONTACTED";

  return (
    <View className="gap-3">
      {/* 4-Step Pipeline Pill Line */}
      {!closed ? (
        <View className="flex-row gap-1.5">
          {STEPS.map((name, i) => {
            const on = i <= current;
            return (
              <View
                key={name}
                className={`flex-1 rounded-full py-1.5 items-center justify-center ${
                  on ? "bg-[#ea580c]" : "bg-[#f4f1ec]"
                }`}
              >
                <Text
                  className={`text-xs ${
                    on ? "font-bold text-white" : "font-medium text-text-secondary"
                  }`}
                >
                  {name}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Interview Invitation / Status Card */}
      {interview && interview.status !== "CANCELLED" && !connected ? (
        <View className="rounded-2xl border border-sky-300 bg-sky-50/70 p-3.5 gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-extrabold text-sky-950">
              {interview.status === "PROPOSED"
                ? "Interview Invitation"
                : `Interview · ${interview.status_label || interview.status}`}
            </Text>
            <Badge tone="info">
              {interview.mode_label || interview.mode}
            </Badge>
          </View>

          <View className="flex-row items-center gap-1.5">
            <Calendar size={13} color="#0284c7" />
            <Text className="text-xs font-semibold text-sky-900">
              {interview.scheduled_date} at {interview.start_time.slice(0, 5)}
            </Text>
          </View>

          {interview.location_text ? (
            <View className="flex-row items-center gap-1.5">
              <MapPin size={13} color="#0284c7" />
              <Text className="text-xs text-sky-800">{interview.location_text}</Text>
            </View>
          ) : null}

          {interview.note ? (
            <Text className="text-xs italic text-sky-700">“{interview.note}”</Text>
          ) : null}

          {/* Actions for Candidate */}
          {interview.status === "PROPOSED" ? (
            asking ? (
              <View className="mt-2 gap-2 border-t border-sky-200/80 pt-2.5">
                <TextInput
                  multiline
                  numberOfLines={2}
                  maxLength={480}
                  value={note}
                  placeholder={
                    asking === "reschedule"
                      ? "e.g. Any day after 4 PM works for me."
                      : "Optional reason"
                  }
                  placeholderTextColor="#94a3b8"
                  onChangeText={setNote}
                  className="rounded-xl border border-sky-200 bg-white p-2.5 text-xs text-text"
                />
                <View className="flex-row gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    loading={answer.isPending}
                    onPress={() => answer.mutate(asking)}
                  >
                    {asking === "reschedule" ? "Ask for Another Time" : "Decline Interview"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => setAsking(null)}
                  >
                    Back
                  </Button>
                </View>
              </View>
            ) : (
              <View className="mt-2 flex-row flex-wrap gap-2 border-t border-sky-200/80 pt-2.5">
                <Button
                  size="sm"
                  variant="primary"
                  loading={answer.isPending}
                  onPress={() => answer.mutate("accept")}
                  className="px-3"
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => setAsking("reschedule")}
                  className="px-3"
                >
                  Ask Another Time
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => setAsking("decline")}
                  className="px-3"
                >
                  Decline
                </Button>
              </View>
            )
          ) : null}
        </View>
      ) : null}

      {/* Connected Confirmation Banner */}
      {connected ? (
        <View className="flex-row items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3">
          <CheckCircle2 size={16} color="#059669" className="mt-0.5" />
          <Text className="flex-1 text-xs font-semibold leading-relaxed text-emerald-950">
            V Solve Hub has completed the connection. You can now contact the employer directly.
          </Text>
        </View>
      ) : null}

      {/* Direct Call to Employer Button */}
      {app.employer_phone ? (
        <Button
          variant="primary"
          size="md"
          onPress={() => void Linking.openURL(`tel:${app.employer_phone}`)}
          className="flex-row items-center justify-center gap-2 self-start px-4"
        >
          <Phone size={14} color="#ffffff" />
          <Text className="text-xs font-bold text-white">
            Call {app.employer_name || "Employer"} · {app.employer_phone}
          </Text>
        </Button>
      ) : null}
    </View>
  );
}
