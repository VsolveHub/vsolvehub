// Ported from frontend/apps/customer/features/shift-day/view/not-right-sheet.tsx
import { canSubmitAttendanceDispute } from "@vsolve/query/native";
import { Button, ConfirmAction, Field, QuantityStepper, Sheet, Text, Textarea } from "@vsolve/mobile-ui";
import { ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import type { ShiftDayView } from "../adapters";
import { CashDemandReport } from "./cash-demand-report";
import { useRespondToAttendance } from "../queries";

export interface NotRightSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engagementId: string;
  day: ShiftDayView;
  amendmentHref: string;
  onDone: () => void;
}

type Tile = "fewer" | "left_early" | "cash" | "other" | null;

export function NotRightSheet({
  open,
  onOpenChange,
  engagementId,
  day,
  amendmentHref,
  onDone,
}: NotRightSheetProps) {
  const [tile, setTile] = useState<Tile>(null);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) setTile(null);
  }

  return (
    <Sheet open={open} onOpenChange={close} title="What went wrong?" dismissable>
      {tile === null ? (
        <View className="gap-2 pb-2">
          <TileButton label="Fewer came than counted" onPress={() => setTile("fewer")} />
          <TileButton label="Left early" onPress={() => setTile("left_early")} />
          <TileButton label="Asked for extra cash" onPress={() => setTile("cash")} />
          <TileButton label="Something else" onPress={() => setTile("other")} />
        </View>
      ) : tile === "cash" ? (
        <CashDemandReport
          engagementId={engagementId}
          stageId={day.stageId}
          amendmentHref={amendmentHref}
          className="pb-2"
        />
      ) : (
        <DisputeTile
          tile={tile}
          day={day}
          engagementId={engagementId}
          onBack={() => setTile(null)}
          onDone={() => {
            close(false);
            onDone();
          }}
        />
      )}
    </Sheet>
  );
}

function TileButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-14 flex-row items-center justify-between rounded-card border border-line bg-surface px-4 py-3 active:bg-surface-hover"
    >
      <Text className="text-sm font-semibold text-text">{label}</Text>
      <ChevronRight size={16} color="#64748B" />
    </Pressable>
  );
}

function DisputeTile({
  tile,
  day,
  engagementId,
  onBack,
  onDone,
}: {
  tile: "fewer" | "left_early" | "other";
  day: ShiftDayView;
  engagementId: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const respond = useRespondToAttendance();
  const expected = day.expectedCount ?? 0;
  const [countSeen, setCountSeen] = useState(Math.max(0, day.presentCount ?? expected));
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  const composedNote =
    tile === "fewer"
      ? `Customer counted ${countSeen} of ${expected} present. ${note.trim()}`.trim()
      : note.trim();
  const canSubmit =
    tile === "fewer" ? composedNote.length > 0 : canSubmitAttendanceDispute([], note);

  return (
    <View className="gap-4 pb-2">
      <Pressable accessibilityRole="button" onPress={onBack} className="self-start">
        <Text className="text-sm font-semibold text-text-link underline">Back</Text>
      </Pressable>

      {tile === "fewer" ? (
        <Field label="How many came?" description={`You booked ${expected}.`}>
          <QuantityStepper
            label="People who came"
            value={countSeen}
            onChange={setCountSeen}
            min={0}
            max={expected}
            decrementLabel="Fewer people came"
            incrementLabel="More people came"
          />
        </Field>
      ) : null}

      <Field
        label={tile === "left_early" ? "What happened" : "Tell us what happened"}
        description="We and the supervisor read this first."
        required={tile !== "fewer"}
      >
        <Textarea
          value={note}
          onChangeText={setNote}
          placeholder={
            tile === "left_early"
              ? "Left by 3pm, well before the day was done."
              : "Only two people came at nine; the third arrived after lunch."
          }
        />
      </Field>

      <Button
        variant="danger"
        disabled={!canSubmit || respond.isPending}
        loading={respond.isPending}
        onPress={() => setConfirming(true)}
      >
        Dispute this day
      </Button>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title="Dispute this day?"
        destructive
        consequence="This day will not be approved automatically and the amount stays unconfirmed while we look into it. Vsolve holds no wage money, so nothing is held back."
        confirmLabel="Yes, dispute it"
        pending={respond.isPending}
        onConfirm={() =>
          respond.mutate(
            {
              engagementId,
              stageId: day.stageId,
              response: "DISPUTE",
              shortfallChoice: "",
              workerDetails: [],
              note: composedNote,
            },
            { onSuccess: onDone },
          )
        }
      />
    </View>
  );
}

