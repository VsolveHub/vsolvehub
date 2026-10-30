// Ported from frontend/apps/partner/features/crew-offer/view/live-offer-sheet.tsx
import { describeError, useServerCountdown } from "@vsolve/query/native";
import { Badge, Button, ConfirmAction, Sheet, Text, formatMoney } from "@vsolve/mobile-ui";
import { usePathname, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import {
  ACCEPT_CONSEQUENCE,
  PAID_DAILY,
  acceptQuestion,
  crewMathsLine,
  crewSizeLine,
  inclusionsLine,
  isOfferLive,
  startDayLabel,
  type CrewOfferAnswer,
} from "../model/offer-state";
import { useAcceptCrewOffer, useDeclineCrewOffer, usePartnerCrewOffers, type CrewOffer } from "../queries";
import { CrewOfferDeclineDialog } from "./crew-offer-decline-dialog";
import { CrewOfferOutcome } from "./crew-offer-outcome";

export function LiveOfferSheet() {
  const pathname = usePathname();
  const showsOffersAlready = pathname === "/work" || pathname.startsWith("/work/offers/");
  const offersQuery = usePartnerCrewOffers(!showsOffersAlready);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [answer, setAnswer] = useState<CrewOfferAnswer | null>(null);

  if (answer !== null) {
    return (
      <Sheet open onOpenChange={(next) => (next ? undefined : setAnswer(null))} title={answer.kind === "accepted" ? "Your answer" : "Passed"} footer={<Button onPress={() => setAnswer(null)}>Done</Button>}>
        <CrewOfferOutcome answer={answer} />
      </Sheet>
    );
  }

  const data = offersQuery.data ?? null;
  const live = data === null ? [] : data.offers.filter((offer) => isOfferLive(offer, data.server_now));
  const offer = live[0] ?? null;
  if (showsOffersAlready || offer === null || dismissed === offer.invitation_id) return null;

  return (
    <OfferSheet
      key={offer.invitation_id}
      offer={offer}
      onDismiss={() => setDismissed(offer.invitation_id)}
      onAnswered={setAnswer}
    />
  );
}

function OfferSheet({
  offer,
  onDismiss,
  onAnswered,
}: {
  readonly offer: CrewOffer;
  readonly onDismiss: () => void;
  readonly onAnswered: (answer: CrewOfferAnswer) => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [declining, setDeclining] = useState(false);
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
  const area = offer.area_label.trim();
  const start = startDayLabel(offer.requested_start);
  const whereWhen = [area || null, start === null ? null : `from ${start}`].filter((part): part is string => part !== null).join(" · ");
  const brief = inclusionsLine(offer.brief.slice(0, 2).map((line) => line.value));
  const busy = accept.isPending || decline.isPending;

  return (
    <Sheet open onOpenChange={(next) => (next ? undefined : onDismiss())} title="New job">
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-text">{crewSizeLine(offer.headcount, offer.days)}</Text>
          {countdown !== null ? (
            <Badge tone={countdown.remainingMs <= 30_000 ? "danger" : "warning"} dot>
              {countdown.display}
            </Badge>
          ) : null}
        </View>
        {whereWhen === "" ? null : <Text className="text-sm text-text-secondary">{whereWhen}</Text>}
        <Text className="text-2xl font-extrabold text-text">{formatMoney(offer.lead_total_receipt_paise)} to you</Text>
        <Text className="text-sm text-text-secondary">
          {crewMathsLine({
            leadDayReceiptPaise: offer.lead_day_receipt_paise,
            headcount: offer.headcount,
            days: offer.days,
          })}{" "}
          · {PAID_DAILY}
        </Text>
        {brief === null ? null : <Text className="text-sm font-semibold text-text">{brief}</Text>}
        {accept.error ? <Text className="text-sm text-danger-text">{describeError(accept.error, "mutation").message}</Text> : null}
        <View className="mt-1 flex-row gap-2">
          <Button className="flex-1" disabled={busy} loading={accept.isPending} loadingLabel="Taking it" onPress={() => setConfirming(true)}>
            Take it
          </Button>
          <Button variant="ghost" disabled={busy} onPress={() => setDeclining(true)}>
            Pass
          </Button>
        </View>
        <Pressable accessibilityRole="link" onPress={() => router.push(`/work/offers/${offer.invitation_id}` as never)}>
          <Text className="text-xs font-semibold text-action-secondary">See the whole brief</Text>
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
              console.warn("[LiveOfferSheet] accept offer failed:", err);
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
    </Sheet>
  );
}
