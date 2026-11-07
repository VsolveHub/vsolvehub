// Ported from frontend/apps/partner/features/crew-offer/view/offer-detail-screen.tsx
import { describeError, hasWorkspaceAction, useServerCountdown } from "@vsolve/query/native";
import { Button, ConfirmAction, ErrorState, Spinner, Text, formatMoney } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";
import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";

import {
  ACCEPT_CONSEQUENCE,
  HOW_DAY_HIRE_WORKS_HREF,
  PAID_DAILY,
  acceptQuestion,
  crewMathsLine,
  crewSizeLine,
  inclusionsLine,
  isOfferLive,
  overtimeLine,
  startDayLabel,
  type CrewOffer,
  type CrewOfferAnswer,
} from "../model/offer-state";
import { useAcceptCrewOffer, useDeclineCrewOffer, usePartnerCrewOffers } from "../queries";
import { CrewMixTable } from "./crew-mix-table";
import { CrewOfferDeclineDialog } from "./crew-offer-decline-dialog";
import { CrewOfferOutcome } from "./crew-offer-outcome";

export function OfferDetailScreen({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const offers = usePartnerCrewOffers();
  const [answer, setAnswer] = useState<CrewOfferAnswer | null>(null);
  const data = offers.data ?? null;
  const offer = data?.offers.find((entry) => entry.invitation_id === invitationId) ?? null;
  const live = data !== null && offer !== null && isOfferLive(offer, data.server_now);
  const gone = !offers.isPending && !offers.isError && !live && answer === null;

  useEffect(() => {
    if (gone) router.replace("/home");
  }, [gone, router]);

  if (answer !== null) {
    return (
      <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-4 px-4 py-6">
        <CrewOfferOutcome answer={answer} />
        <Button onPress={() => router.replace("/home")}>Done</Button>
      </ScrollView>
    );
  }
  if (offers.isPending) {
    return (
      <View className="flex-1 flex-row items-center justify-center gap-2 bg-canvas">
        <Spinner size="sm" />
        <Text className="text-text-secondary">Loading this offer…</Text>
      </View>
    );
  }
  if (offers.isError) {
    return (
      <ErrorState
        title="We could not load this offer"
        message="Nothing has been answered. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void offers.refetch()}
      />
    );
  }
  if (offer === null || !live) return null;
  return <OfferDecision offer={offer} onAnswered={setAnswer} />;
}

function OfferDecision({
  offer,
  onAnswered,
}: {
  readonly offer: CrewOffer;
  readonly onAnswered: (answer: CrewOfferAnswer) => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [declining, setDeclining] = useState(false);
  const grants = usePartnerWorkspaceGrants();
  const canManageCrew = hasWorkspaceAction(grants.grants ?? [], WORKFORCE_WORKSPACE, "crew.manage");
  const countdown = useServerCountdown(offer.responds_by, 1000);
  const accept = useAcceptCrewOffer(offer.invitation_id, {
    onAccepted: (booking) => {
      setConfirming(false);
      onAnswered({ kind: "accepted", offer, booking });
    },
  });
  const decline = useDeclineCrewOffer(offer.invitation_id, {
    onDeclined: (declined, input) => {
      setDeclining(false);
      onAnswered({ kind: "declined", offer: declined, reasonCode: input.reasonCode });
    },
  });
  const start = startDayLabel(offer.requested_start);
  const area = offer.area_label.trim();
  const overtime = overtimeLine(offer.overtime_hourly_paise, offer.standard_day_hours);
  const inclusions = inclusionsLine(offer.inclusions, 3);
  const busy = accept.isPending || decline.isPending;

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="pb-8">
      <View className="items-center gap-2 bg-action px-5 py-6">
        {countdown ? <Text className="text-lg font-bold text-text">{countdown.display}</Text> : null}
        <Text className="text-4xl font-extrabold text-text">{formatMoney(offer.lead_total_receipt_paise)}</Text>
        <Text className="text-xs font-bold uppercase text-action-text">to you</Text>
        <Text className="text-center text-sm font-semibold text-text">
          {crewMathsLine({
            leadDayReceiptPaise: offer.lead_day_receipt_paise,
            headcount: offer.headcount,
            days: offer.days,
          })}{" "}
          · {PAID_DAILY}
        </Text>
      </View>
      <View className="gap-3 px-4 pt-4">
        <Fact label="Crew" value={crewSizeLine(offer.headcount, offer.days)} />
        <Fact label="Where" value={area === "" ? "Not stated" : area} />
        <Fact label="From" value={start ?? "Not stated"} />
        {inclusions || overtime ? (
          <View className="rounded-card border border-line bg-surface px-3.5 py-3">
            {inclusions ? <Text className="text-sm font-semibold text-text">{inclusions}</Text> : null}
            {overtime ? <Text className="text-sm text-text-secondary">{overtime}</Text> : null}
          </View>
        ) : null}
        <CrewMixTable
          lines={offer.crew_mix}
          footnote={
            canManageCrew
              ? `Your verified roster has ${offer.verified_roster_size}.`
              : undefined
          }
        />
        {accept.error ? <Text className="text-sm text-danger-text">{describeError(accept.error, "mutation").message}</Text> : null}
        <Button disabled={busy} loading={accept.isPending} loadingLabel="Taking it" onPress={() => setConfirming(true)}>
          Take it
        </Button>
        <Button variant="ghost" disabled={busy} onPress={() => setDeclining(true)}>
          Pass
        </Button>
        <Pressable accessibilityRole="link" onPress={() => router.push(HOW_DAY_HIRE_WORKS_HREF as never)}>
          <Text className="text-sm font-semibold text-action-secondary">How day-hire works</Text>
        </Pressable>
      </View>
      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title={acceptQuestion(offer)}
        consequence={ACCEPT_CONSEQUENCE}
        confirmLabel="Yes, send them"
        cancelLabel="Back"
        pending={accept.isPending}
        onConfirm={() =>
          accept.mutate(undefined, {
            onError: (err) => {
              console.warn("[OfferDetailScreen] accept offer failed:", err);
              setConfirming(false);
            },
          })
        }
      />
      <CrewOfferDeclineDialog
        open={declining}
        onOpenChange={setDeclining}
        pending={decline.isPending}
        error={decline.error ? describeError(decline.error, "mutation").message : null}
        onDecline={(input) => decline.mutate(input)}
      />
    </ScrollView>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between rounded-card border border-line bg-surface px-3.5 py-3">
      <Text className="text-sm text-text-secondary">{label}</Text>
      <Text className="text-sm font-semibold text-text">{value}</Text>
    </View>
  );
}
