import { describeError } from "@vsolve/query/native";
import { Button, ErrorState, Sheet, Text, Textarea, cn } from "@vsolve/mobile-ui";
import { ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { canAbort, useAbortWork, useReleaseBooking, type PartnerVisit } from "@/features/work/queries";

import { Pictogram } from "./pictogram";

const OTHER = "Something else";
const HAND_BACK_REASONS = ["I can't make this time", "It's too far for me", "I have an emergency", "I can't do this work", OTHER] as const;
const STOP_REASONS = ["Customer asked to stop", "Not safe to continue", "Needs a spare part", OTHER] as const;

/**
 * Giving up a job: a quiet row, then a sheet that asks before anything happens.
 *
 * It used to be a loud red block on the screen, inviting the tap nobody wants by accident. The row
 * sits with the other "need help" options. The sheet takes the reason in one tap, typing only for
 * "Something else", and "Keep this job" is the easy way out.
 */
export function ReleaseAction({ visit }: { readonly visit: PartnerVisit }) {
  const abort = useAbortWork();
  const release = useReleaseBooking();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  const aborting = canAbort(visit);
  const mutation = aborting ? abort : release;
  const reasons = aborting ? STOP_REASONS : HAND_BACK_REASONS;
  const label = aborting ? "Stop this job" : "Hand this job back";
  const reason = picked === OTHER ? typed.trim() : (picked ?? "");
  const presentation = mutation.error ? describeError(mutation.error, "mutation") : null;

  const close = () => {
    setOpen(false);
    setPicked(null);
    setTyped("");
    mutation.reset();
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        className="min-h-16 flex-row items-center gap-3 px-4 py-3 active:bg-surface-sunken"
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-danger-surface">
          <Pictogram name="no" size="sm" className="text-danger-text" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-semibold text-text">{label}</Text>
          <Text className="text-xs text-text-secondary">
            {aborting ? "Work stops here. You still report what was done." : "You give up the job. No penalty."}
          </Text>
        </View>
        <ChevronRight size={20} color="#6b7280" />
      </Pressable>

      <Sheet
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title={aborting ? "Stop this job?" : "Hand this job back?"}
        description={
          aborting
            ? "Completed work is still settled. You will report it next."
            : "We will find a replacement quickly. There is no penalty."
        }
        footer={
          <View className="gap-2">
            <Button variant="primary" disabled={mutation.isPending} onPress={close}>
              Keep this job
            </Button>
            <Button
              variant="outline"
              disabled={reason.length === 0}
              loading={mutation.isPending}
              loadingLabel="Sending"
              onPress={() => mutation.mutate({ bookingId: visit.id, expectedVersion: visit.version, reason })}
            >
              {label}
            </Button>
          </View>
        }
      >
        <View className="gap-3">
          {presentation ? (
            <ErrorState inline title={presentation.title} message={presentation.message} severity={presentation.severity} reference={presentation.reference} />
          ) : null}
          <Text className="text-sm font-bold text-text">What happened?</Text>
          <View className="flex-row flex-wrap gap-2">
            {reasons.map((option) => {
              const selected = picked === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setPicked(option)}
                  className={cn("min-h-11 justify-center rounded-full border px-4", selected ? "border-selected-line bg-selected-surface" : "border-line bg-surface")}
                >
                  <Text className={cn("text-sm font-semibold", selected ? "text-action-secondary" : "text-text-secondary")}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
          {picked === OTHER ? (
            <Textarea accessibilityLabel="Tell us what happened" className="min-h-20 w-full" value={typed} onChangeText={setTyped} maxLength={240} />
          ) : null}
        </View>
      </Sheet>
    </>
  );
}
