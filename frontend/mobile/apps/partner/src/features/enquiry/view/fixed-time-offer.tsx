// Ported from frontend/apps/partner/features/visit/view/fixed-time-offer.tsx
import { useServerCountdown } from "@vsolve/query/native";
import { Button, ErrorState, FactTile, Sheet, Text, formatMoney } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Pressable, View } from "react-native";

import type { DeclineReasonCode } from "@/features/enquiry/model/decline-reasons";
import type { EnquiryRecord } from "@/features/enquiry/model/wire";
import { useAcceptEnquiry, useDeclineEnquiry } from "@/features/enquiry/queries";
import { describeVisitDuration } from "@/features/visit/model/slot-grid";
import { Pictogram } from "@/features/work-stack/view/pictogram";

const PASS_REASONS: readonly { code: DeclineReasonCode; label: string }[] = [
  { code: "TOO_FAR", label: "Too far" },
  { code: "NO_CAPACITY", label: "Busy then" },
  { code: "OUT_OF_SCOPE", label: "Not my kind of work" },
];

export function FixedTimeOffer({ enquiry }: { enquiry: EnquiryRecord }) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const accept = useAcceptEnquiry(enquiry.id);
  const decline = useDeclineEnquiry(enquiry.id);
  const [passing, setPassing] = useState(false);
  const [showingAreaDetail, setShowingAreaDetail] = useState(false);
  const busy = accept.isPending || decline.isPending;
  const countdown = useServerCountdown(enquiry.respondsBy, 1000);

  if (enquiry.fixedVisitStart === null) {
    return (
      <ErrorState
        inline
        severity="info"
        title="No visit time yet"
        message="The customer has not picked a time for this visit. We will send it to you the moment they do."
      />
    );
  }

  const starts = new Date(enquiry.fixedVisitStart);
  const dateLabel = Number.isNaN(starts.getTime())
    ? enquiry.fixedVisitStart
    : new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone }).format(starts);
  const timeLabel = Number.isNaN(starts.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(starts);
  const startsLabel = enquiry.fixedVisitDurationMinutes === null ? timeLabel : `${timeLabel} · ${describeVisitDuration(enquiry.fixedVisitDurationMinutes)}`;

  return (
    <View className="flex-col gap-4">
      <View className="items-center gap-2 rounded-card bg-action px-4 py-5">
        {countdown !== null ? (
          <View accessibilityLabel={countdown.announce} className="items-center">
            <Pictogram name="time" size="xs" className="text-text" />
            <Text className="text-2xl font-extrabold text-text">{countdown.display}</Text>
          </View>
        ) : null}
        {enquiry.fixedVisitEarningPaise === null ? null : (
          <>
            <Text className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-action-text">You receive</Text>
            <Text className="text-[2.75rem] font-extrabold leading-none tracking-[-0.025em] text-action-text">{formatMoney(enquiry.fixedVisitEarningPaise)}</Text>
          </>
        )}
      </View>
      <View className="flex-row flex-wrap gap-2.5">
        <View className="w-[48%]"><FactTile icon={<Pictogram name="papers" size="md" />} label="Service" value={enquiry.serviceName} /></View>
        <View className="w-[48%]">
          <FactTile icon={<Pictogram name="distance" size="md" />} label="Area" value={enquiry.approximateArea.trim() === "" ? "Not given" : enquiry.approximateArea} onClick={() => setShowingAreaDetail(true)} />
        </View>
        <View className="w-[48%]"><FactTile icon={<Pictogram name="date" size="md" />} label="Date" value={dateLabel} /></View>
        <View className="w-[48%]"><FactTile icon={<Pictogram name="time" size="md" />} label="Starts" value={startsLabel} /></View>
      </View>
      <Text className="text-sm leading-6 text-text-secondary">The customer picked this time. Take it or pass — there is nothing to schedule.</Text>
      {accept.isError ? (
        <ErrorState
          inline
          severity="warning"
          title="This visit was taken by another professional"
          message="Someone accepted it first. Nothing is owed either way, and the next offer will reach you the same way."
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={busy || countdown?.isExpired === true}
        onPress={() => accept.mutate()}
        className="h-20 flex-row items-center justify-center gap-3 rounded-[20px] bg-success-text"
      >
        <Pictogram name="yes" size="lg" className="text-surface" />
        <Text className="text-xl font-bold text-surface">{accept.isPending ? "Accepting…" : "Take this visit"}</Text>
      </Pressable>
      <Button block variant="outline" size="lg" onPress={() => setPassing(true)} disabled={busy} loading={decline.isPending} loadingLabel="Passing">
        Pass
      </Button>
      <Sheet open={passing} onOpenChange={setPassing} title="Pass on this visit" description="Tell us why so the next offer fits better.">
        <View className="gap-2">
          {PASS_REASONS.map((reason) => (
            <Pressable
              key={reason.code}
              accessibilityRole="button"
              disabled={decline.isPending}
              onPress={() => decline.mutate({ reasonCode: reason.code }, { onSuccess: () => setPassing(false) })}
              className="min-h-12 justify-center rounded-2xl border border-line px-3"
            >
              <Text className="text-sm font-semibold text-text">{reason.label}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
      <Sheet open={showingAreaDetail} onOpenChange={setShowingAreaDetail} title="Area">
        <Text className="text-sm leading-6 text-text-secondary">
          {enquiry.approximateArea.trim() === "" ? "The customer has not given an area." : `Near ${enquiry.approximateArea}. The street is shared after payment.`}
        </Text>
      </Sheet>
    </View>
  );
}
