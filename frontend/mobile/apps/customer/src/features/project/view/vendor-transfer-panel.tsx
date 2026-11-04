// Ported from frontend/apps/customer/features/project/view/vendor-transfer-panel.tsx
import { useServerCountdown } from "@vsolve/query/native";
import { Badge, Button, ConfirmAction, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { View } from "react-native";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import type { MilestoneView, TransferView } from "../adapters";
import { useDecideTransfer } from "../queries";

export interface VendorTransferPanelProps {
  engagementId: string;
  transfer: TransferView;
  leftWithVendor: readonly MilestoneView[];
  /** "project" — the noun this agreement uses. */
  engagementNoun: string;
  /** "stage" / "stages". */
  stageNoun: string;
  stagesNoun: string;
  onDone: () => void;
}

export function VendorTransferPanel({
  engagementId,
  transfer,
  leftWithVendor,
  engagementNoun,
  stageNoun,
  stagesNoun,
  onDone,
}: VendorTransferPanelProps) {
  const decide = useDecideTransfer();
  const [confirming, setConfirming] = useState<"accept" | "decline" | null>(null);
  const countdown = useServerCountdown(transfer.isDecidable ? transfer.expiresAtIso : null, 60_000);

  if (!transfer.isKnownStatus) {
    return (
      <View className="mt-8">
        <Text className="text-lg font-semibold text-text">We cannot describe this</Text>
        <Text className="mt-1 text-sm leading-6 text-text-secondary">
          There is a change of professional recorded on this {engagementNoun} and
          this app does not recognise the state it is in, so it is not going to
          guess. Nothing about your agreement has changed. Please contact
          support.
        </Text>
      </View>
    );
  }

  if (transfer.status === "DECLINED") {
    return (
      <View className="mt-8">
        <Text className="text-lg font-semibold text-text">You kept the current professional</Text>
        <Text className="mt-1 text-sm leading-6 text-text-secondary">
          You turned down the replacement we proposed
          {transfer.decidedAt === null ? "" : ` on ${transfer.decidedAt}`}. The
          professional, the {stagesNoun} and the prices are all exactly as they
          were. If the work still is not moving, contact support and we will
          look again.
        </Text>
      </View>
    );
  }

  if (transfer.status === "EXPIRED") {
    return (
      <View className="mt-8">
        <Text className="text-lg font-semibold text-text">
          A replacement was offered and the offer ran out
        </Text>
        <Text className="mt-1 text-sm leading-6 text-text-secondary">
          Nobody answered in time, so nothing changed — the professional, the{" "}
          {stagesNoun} and the prices stand. Replacements are held open for a
          limited time because somebody else is keeping the dates free. Contact
          support if you still need one.
        </Text>
      </View>
    );
  }

  if (transfer.status === "ACCEPTED") {
    return (
      <View className="mt-8">
        <View className="flex-row flex-wrap items-start justify-between gap-2">
          <Text className="text-lg font-semibold text-text">
            This {engagementNoun} moved to a new professional
          </Text>
          <Badge tone="info">Replacement in place</Badge>
        </View>
        <Text className="mt-1 text-sm leading-6 text-text-secondary">
          You accepted the replacement
          {transfer.appliedAt === null ? "" : ` on ${transfer.appliedAt}`}. The
          unfinished {stagesNoun} are now at the new prices you agreed.
        </Text>

        <Totals transfer={transfer} stagesNoun={stagesNoun} />
        <MilestoneTable transfer={transfer} stageNoun={stageNoun} />

        {transfer.hasRefund ? (
          <Text className="mt-3 text-sm leading-6 text-text">
            <Text className="font-semibold text-text">{transfer.refundedLabel}</Text> went
            back to you — everything you had funded on those {stagesNoun} that
            nobody had earned. It returns the way you paid it, which can take a
            few working days.
          </Text>
        ) : (
          <Text className="mt-3 text-sm leading-6 text-text-secondary">
            Nothing was refunded, because nothing you had funded on the
            unfinished {stagesNoun} was still sitting with us.
          </Text>
        )}

        <MaterialsLeftBehind
          transfer={transfer}
          leftWithVendor={leftWithVendor}
          engagementNoun={engagementNoun}
        />

        <Text className="mt-3 text-sm leading-6 text-text">
          This {engagementNoun} is back at &quot;not started&quot;, because the new
          professional has nothing funded and no clearance to begin. Work
          restarts when you fund the first {stageNoun} above — at the price you
          just accepted, and there is nothing extra to pay for the change itself.
        </Text>
      </View>
    );
  }

  /* PROPOSED — the decision */
  return (
    <View className="mt-8">
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <Text className="text-lg font-semibold text-text">
          We have found somebody to finish this {engagementNoun}
        </Text>
        <Badge tone="warning">Proposed — not agreed</Badge>
      </View>

      <Text className="mt-2 text-sm leading-6 text-text">
        The professional on this {engagementNoun} is not going to finish it, so we
        have found another one and asked them to price{" "}
        <Text className="font-semibold text-text">every {stageNoun} that is left</Text>,
        one by one. Nothing has changed yet. This is yours to accept or turn
        down.
      </Text>

      {transfer.note !== null ? (
        <Text className="mt-2 text-sm leading-6 text-text-secondary">
          {transfer.note}
        </Text>
      ) : null}

      <Totals transfer={transfer} stagesNoun={stagesNoun} />
      <MilestoneTable transfer={transfer} stageNoun={stageNoun} />

      <View className="mt-3 rounded-card border border-line bg-surface-sunken p-4">
        <Text className="text-sm font-semibold text-text">What happens to your money</Text>
        <View className="mt-2 gap-1">
          <Text className="text-sm leading-6 text-text-secondary">
            • Everything you have funded on the unfinished {stagesNoun} that nobody
            has earned is <Text className="font-semibold text-text">refunded to you first</Text>.
          </Text>
          <Text className="text-sm leading-6 text-text-secondary">
            • Those {stagesNoun} then go back to unfunded at the new prices, and
            you fund them one at a time as you reach them — exactly as before.
          </Text>
          <Text className="text-sm leading-6 text-text-secondary">
            • <Text className="font-semibold text-text">There is nothing to pay for the change itself.</Text>{" "}
            No new charge is created here, and you are never asked twice for the
            same {stageNoun}.
          </Text>
          <Text className="text-sm leading-6 text-text-secondary">
            • Work stops until you fund the first {stageNoun} again. The new
            professional starts with nothing funded, the same as at the
            beginning.
          </Text>
        </View>
      </View>

      <MaterialsLeftBehind
        transfer={transfer}
        leftWithVendor={leftWithVendor}
        engagementNoun={engagementNoun}
      />

      {countdown !== null && !countdown.isExpired && transfer.expiresAt !== null ? (
        <Text className="mt-3 text-sm text-text-secondary">
          The replacement is holding these dates until {transfer.expiresAt}.
        </Text>
      ) : null}

      {transfer.isDecidable ? (
        <View className="mt-4 flex-row flex-wrap gap-2">
          <Button onPress={() => setConfirming("accept")} disabled={decide.isPending}>
            Accept this replacement
          </Button>
          <Button
            variant="outline"
            onPress={() => setConfirming("decline")}
            disabled={decide.isPending}
          >
            No, keep looking
          </Button>
        </View>
      ) : null}

      <ConfirmAction
        open={confirming === "accept"}
        onOpenChange={(open) => setConfirming(open ? "accept" : null)}
        title="Move this project to the replacement?"
        consequence={
          transfer.direction === "costs_more"
            ? `The unfinished ${stagesNoun} are repriced, and finishing this ${engagementNoun} will cost ${transfer.deltaLabel} more than it would have. Anything you funded and nobody earned comes back to you first, and you fund the new prices one ${stageNoun} at a time. There is nothing to pay right now, and this cannot be undone.`
            : transfer.direction === "costs_less"
              ? `The unfinished ${stagesNoun} are repriced, and finishing this ${engagementNoun} will cost ${transfer.deltaLabel} less than it would have. Anything you funded and nobody earned comes back to you first. There is nothing to pay right now, and this cannot be undone.`
              : `The unfinished ${stagesNoun} are repriced at the same total. Anything you funded and nobody earned comes back to you first. There is nothing to pay right now, and this cannot be undone.`
        }
        confirmLabel="Yes, move it"
        pending={decide.isPending}
        onConfirm={() =>
          decide.mutate(
            { engagementId, transferId: transfer.transferId, accept: true },
            {
              onSuccess: () => {
                setConfirming(null);
                onDone();
              },
            },
          )
        }
      />

      <ConfirmAction
        open={confirming === "decline"}
        onOpenChange={(open) => setConfirming(open ? "decline" : null)}
        title="Turn down this replacement?"
        consequence={`Nothing changes: the current professional, the ${stagesNoun} and the prices all stay exactly as they are. We will not offer this particular replacement again, and if the work still does not move you will need to ask us to find somebody else.`}
        confirmLabel="Yes, turn it down"
        pending={decide.isPending}
        onConfirm={() =>
          decide.mutate(
            { engagementId, transferId: transfer.transferId, accept: false },
            {
              onSuccess: () => {
                setConfirming(null);
                onDone();
              },
            },
          )
        }
      />

      <DecisionRefusal
        error={decide.error}
        engagementNoun={engagementNoun}
        stageNoun={stageNoun}
        onRefresh={onDone}
      />
    </View>
  );
}

function Totals({ transfer, stagesNoun }: { transfer: TransferView; stagesNoun: string }) {
  return (
    <View className="mt-3 rounded-card border border-line bg-surface overflow-hidden">
      <Row
        label={`What the current professional was owed for the unfinished ${stagesNoun}`}
        value={transfer.previousRemainingLabel}
      />
      <Row
        label="What the replacement wants for the same work"
        value={transfer.replacementRemainingLabel}
      />
      {transfer.direction === "same" ? (
        <Row label="Difference" value="No change" strong />
      ) : (
        <Row
          label={transfer.direction === "costs_more" ? "It costs you" : "It saves you"}
          value={`${transfer.deltaLabel} ${transfer.direction === "costs_more" ? "more" : "less"}`}
          strong
        />
      )}
    </View>
  );
}

function MilestoneTable({
  transfer,
  stageNoun,
}: {
  transfer: TransferView;
  stageNoun: string;
}) {
  if (transfer.lines === null) return null;
  return (
    <View className="mt-3 rounded-card border border-line bg-surface overflow-hidden">
      <View className="flex-row items-center justify-between border-b border-line bg-surface-sunken px-3 py-2">
        <Text className="text-xs font-bold uppercase text-text-muted">{stageNoun}</Text>
        <View className="flex-row items-center gap-4">
          <Text className="text-xs font-bold uppercase text-text-muted">Agreed</Text>
          <Text className="text-xs font-bold uppercase text-text-muted">New</Text>
        </View>
      </View>
      {transfer.lines.map((line) => (
        <View
          key={line.stageId}
          className="flex-row items-center justify-between border-b border-line px-3 py-2.5 last:border-b-0"
        >
          <Text className="mr-2 flex-1 text-sm font-medium text-text">{line.label}</Text>
          <View className="flex-row items-center gap-4">
            <Text className="text-sm text-text-secondary line-through">{line.agreedLabel}</Text>
            <Text className="text-sm font-semibold text-text">{line.replacementLabel}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function MaterialsLeftBehind({
  transfer,
  leftWithVendor,
  engagementNoun,
}: {
  transfer: TransferView;
  leftWithVendor: readonly MilestoneView[];
  engagementNoun: string;
}) {
  if (!transfer.hasMaterialOutstanding && leftWithVendor.length === 0) return null;
  return (
    <View className="mt-3 rounded-card border border-warning-line bg-warning-surface p-4">
      <Text className="text-sm font-semibold text-text">Materials money stays where it is</Text>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">
        {transfer.materialOutstandingLabel} you paid for materials is not recovered by this
        transfer and does not move to the new professional. That money bought goods rather than
        work. If the goods were not delivered or the site is locked, contact support about this{" "}
        {engagementNoun} before you accept.
      </Text>
    </View>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between border-b border-line px-3 py-2.5">
      <Text className="mr-2 flex-1 text-sm text-text-secondary">{label}</Text>
      <Text className={`text-sm ${strong ? "font-bold text-text" : "font-semibold text-text"}`}>
        {value}
      </Text>
    </View>
  );
}

function DecisionRefusal({
  error,
  engagementNoun,
  stageNoun,
  onRefresh,
}: {
  error: unknown;
  engagementNoun: string;
  stageNoun: string;
  onRefresh: () => void;
}) {
  if (error === null || error === undefined) return null;

  return (
    <View className="mt-3">
      <AccessRefusal
        error={error}
        attempting={`answer this replacement proposal for your ${engagementNoun}`}
      />
    </View>
  );
}
