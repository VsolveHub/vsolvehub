// Ported from frontend/apps/partner/features/offers/view/offer-card.tsx
import type { Schemas } from "@vsolve/api-client";
import { useServerCountdown } from "@vsolve/query/native";
import { Button, Text, cn, formatMoney } from "@vsolve/mobile-ui";
import { View } from "react-native";

import type { Offer, OfferAction, OfferStatus } from "../queries";

const STATUS_LABELS: Record<OfferStatus, string> = {
  OFFERED: "Offered to you",
  ACCEPTED_PENDING_UNDO: "Accepted — you can still undo",
  COMMITTED: "Committed",
  UNDONE: "Undone",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  REVOKED: "Withdrawn",
};

function formatWhen(instant: string | null): string {
  if (instant === null) return "Time not given";
  return new Date(instant).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Deadline({ label, deadline }: { label: string; deadline: string | null }) {
  const countdown = useServerCountdown(deadline, 1000);
  if (countdown === null || countdown.isExpired) return null;
  return (
    <Text className="text-sm font-semibold">
      {countdown.display}
      <Text className="font-normal"> {label}</Text>
    </Text>
  );
}

function MoneyRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: Schemas["Money"] | null;
  strong?: boolean;
}) {
  if (value === null) return null;
  return (
    <View className="flex-row justify-between gap-3">
      <Text className={cn("text-sm", strong ? "font-semibold text-text" : "text-text-secondary")}>{label}</Text>
      <Text className={cn("text-sm", strong && "font-semibold text-text")}>{formatMoney(value.amount_paise)}</Text>
    </View>
  );
}

export function OfferCard({
  offer,
  isBusy,
  unconfirmedMessage,
  onCommand,
}: {
  offer: Offer;
  isBusy: boolean;
  unconfirmedMessage: string | null;
  onCommand: (action: OfferAction) => void;
}) {
  const isOffered = offer.status === "OFFERED";
  const isPendingUndo = offer.status === "ACCEPTED_PENDING_UNDO";
  return (
    <View className="overflow-hidden rounded-card border border-line bg-surface">
      <View className="bg-warning-surface px-4 py-2.5">
        <Text className="text-xs font-bold uppercase tracking-wide text-warning-text">
          {STATUS_LABELS[offer.status]}
        </Text>
        {isOffered ? <Deadline label="to respond" deadline={offer.expires_at} /> : null}
        {isPendingUndo ? <Deadline label="left to undo" deadline={offer.undo_deadline} /> : null}
      </View>
      <View className="gap-2 p-4">
        <Text className="text-base font-bold text-text">{offer.approximate_area ?? "Area not given"}</Text>
        <Text className="text-sm font-medium text-text-secondary">
          {offer.service_lines.map((line) => line.service_label).join(", ")}
        </Text>
        <Text className="text-sm text-text-secondary">
          {formatWhen(offer.starts_at)}
          {offer.estimated_duration_minutes !== null ? ` · ~${offer.estimated_duration_minutes} min work` : ""}
        </Text>
        <View className="mt-1 gap-1 rounded-card border border-line bg-surface-sunken p-3">
          <MoneyRow label="Job total" value={offer.estimated_gross} />
          <MoneyRow label="Commission" value={offer.commission} />
          <MoneyRow label="You receive" value={offer.estimated_net} strong />
        </View>
        <Text className="text-[0.6875rem] text-text-muted">
          Estimated from the scope above. The final amount follows what is actually done.
        </Text>
        {unconfirmedMessage !== null ? (
          <Text className="text-sm text-critical">{unconfirmedMessage}</Text>
        ) : null}
        {isOffered ? (
          <View className="mt-2 flex-row gap-3">
            <Button className="flex-1" loading={isBusy} loadingLabel="Accepting" onPress={() => onCommand("accept")}>
              Accept
            </Button>
            <Button className="flex-1" variant="outline" disabled={isBusy} onPress={() => onCommand("decline")}>
              Decline
            </Button>
          </View>
        ) : null}
        {isPendingUndo ? (
          <View className="mt-2 gap-3">
            <Text className="text-sm text-text-secondary">
              This is yours. You can still undo at no cost until the timer runs out, or commit now to lock it in.
            </Text>
            <View className="flex-row gap-3">
              <Button className="flex-1" loading={isBusy} loadingLabel="Committing" onPress={() => onCommand("commit")}>
                Commit now
              </Button>
              <Button className="flex-1" variant="outline" disabled={isBusy} onPress={() => onCommand("undo")}>
                Undo — no penalty
              </Button>
            </View>
          </View>
        ) : null}
        {offer.status === "COMMITTED" ? (
          <Text className="text-sm text-text-secondary">
            Committed. The job details will appear in your work list when that is available.
          </Text>
        ) : null}
      </View>
    </View>
  );
}
