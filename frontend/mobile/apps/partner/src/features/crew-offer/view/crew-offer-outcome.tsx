// Ported from frontend/apps/partner/features/crew-offer/view/crew-offer-outcome.tsx
import { useServerCountdown } from "@vsolve/query/native";
import { Badge, Card, Text, formatMoney } from "@vsolve/mobile-ui";

import { findCrewOfferDeclineReason } from "../model/decline-reasons";
import {
  DONT_TRAVEL_YET,
  HOLD_LAPSED,
  crewSizeLine,
  describeAccept,
  startDayLabel,
  type CrewOfferAnswer,
} from "../model/offer-state";

export function CrewOfferOutcome({ answer }: { readonly answer: CrewOfferAnswer }) {
  return answer.kind === "accepted" ? <AcceptedOutcome answer={answer} /> : <DeclinedOutcome answer={answer} />;
}

function AcceptedOutcome({ answer }: { readonly answer: Extract<CrewOfferAnswer, { kind: "accepted" }> }) {
  const { booking, offer } = answer;
  const outcome = describeAccept(booking);
  const hold = useServerCountdown(outcome.isHeld ? booking.hold_expires_at : null, 1000);
  const lapsed = outcome.isHeld && (hold?.isExpired ?? false);
  const where = [offer.area_label.trim() || null, startDayLabel(offer.requested_start)]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <Card className="gap-2.5 p-4">
      <Badge tone={lapsed ? "neutral" : outcome.isHeld ? "warning" : "success"} dot>
        {lapsed ? "Hold lapsed" : `✓ ${outcome.title}`}
      </Badge>
      {lapsed ? (
        <Text className="text-base font-semibold text-text">{HOLD_LAPSED}</Text>
      ) : (
        <>
          <Text className="text-base font-semibold text-text">
            {outcome.message}
            {hold ? `  ${hold.display}` : ""}
          </Text>
          {outcome.isHeld ? <Text className="text-sm font-semibold text-warning-text">{DONT_TRAVEL_YET}</Text> : null}
        </>
      )}
      <Text className="text-sm text-text-secondary">
        {where === "" ? "" : `${where} · `}
        {booking.headcount} × {booking.days} {booking.days === 1 ? "day" : "days"}
      </Text>
      {lapsed ? null : (
        <Text className="text-sm text-text-secondary">
          {formatMoney(booking.lead_receipt_paise)} to you · paid daily by customer
        </Text>
      )}
    </Card>
  );
}

function DeclinedOutcome({ answer }: { readonly answer: Extract<CrewOfferAnswer, { kind: "declined" }> }) {
  const reason = findCrewOfferDeclineReason(answer.reasonCode);
  return (
    <Card className="gap-2 p-4">
      <Badge dot>Passed</Badge>
      <Text className="text-sm text-text-secondary">
        {crewSizeLine(answer.offer.headcount, answer.offer.days)} — gone to the next lead. Nothing against you.
      </Text>
      {reason ? <Text className="text-sm text-text-secondary">{reason.consequence}</Text> : null}
    </Card>
  );
}
