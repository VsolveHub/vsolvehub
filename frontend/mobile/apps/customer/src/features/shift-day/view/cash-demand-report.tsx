// Ported from frontend/apps/customer/features/shift-day/view/cash-demand-report.tsx
import { Badge, Button, ConfirmAction, Field, Input, Text, Textarea } from "@vsolve/mobile-ui";
import { Link } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { isUsableRupeeInput, rupeesToPaise } from "../adapters";
import { useReportCashDemand } from "../queries";

export interface CashDemandReportProps {
  engagementId: string;
  stageId: string | null;
  amendmentHref?: string;
  className?: string;
}

export function CashDemandReport({
  engagementId,
  stageId,
  amendmentHref = "#",
  className,
}: CashDemandReportProps) {
  const report = useReportCashDemand();
  const [confirming, setConfirming] = useState(false);
  const [typedAmount, setTypedAmount] = useState("");
  const [note, setNote] = useState("");

  const amountIsUsable = isUsableRupeeInput(typedAmount);

  if (report.isSuccess) {
    return (
      <View className={className}>
        <View className="rounded-card border border-line bg-surface-sunken p-4">
          <View className="flex-row flex-wrap items-start justify-between gap-2">
            <Text className="font-semibold text-text">Thank you — that is recorded</Text>
            <Badge tone="neutral">Reported</Badge>
          </View>
          <Text className="mt-1 text-sm leading-6 text-text">
            We have written it against this professional&apos;s record, with
            today&apos;s date. One report on its own does not decide anything about
            them, and we are not going to tell you it does — what we look at is a
            pattern. Nothing about your booking has changed and no money has moved.
          </Text>
          <Text className="mt-2 text-sm leading-6 text-text-secondary">
            You still owe them the published rate for the work they actually did.
            If they refuse to carry on without the extra, tell us and stop — do
            not pay it to keep the peace.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className={className}>
      <Text className="text-lg font-semibold text-text">
        Did they ask for extra in cash?
      </Text>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">
        You booked this at a published rate and that is the whole price. If
        somebody asked you for more on site — cash, a tip they insisted on, a
        price they said had gone up — tell us in one tap. You do not have to prove
        anything and you do not have to name a figure.
      </Text>
      <Text className="mt-2 text-sm leading-6 text-text-secondary">
        Extra <Text className="italic">work</Text> is different and is allowed: overtime and add-ons are
        priced by us at the published rates and come to you as a change to agree
        or refuse.{" "}
        <Link href={amendmentHref as never}>
          <Text className="font-medium text-action underline">Those appear as change requests</Text>
        </Link>
        , never as cash on the day.
      </Text>

      <View className="mt-3">
        <Button variant="outline" onPress={() => setConfirming(true)}>
          They asked me for extra in cash
        </Button>
      </View>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title="Report a cash demand?"
        consequence="We record this against the professional, with today's date. It is not proof on its own and one report changes nothing about them — we look for a pattern. Nothing happens to your booking and no money moves either way. It cannot be withdrawn once sent."
        confirmLabel="Send the report"
        pending={report.isPending}
        onConfirm={() =>
          report.mutate({
            engagementId,
            stageId,
            amountClaimedPaise: rupeesToPaise(typedAmount),
            note: note.trim(),
          })
        }
      >
        <Field
          label="How much did they ask for?"
          description="Optional. Whole rupees, if you remember."
        >
          <Input
            keyboardType="numeric"
            value={typedAmount}
            onChangeText={setTypedAmount}
            placeholder="2000"
          />
        </Field>
        {!amountIsUsable ? (
          <Text className="mt-1 text-sm text-text-secondary">
            We will send the report without an amount unless that is a plain
            number of rupees.
          </Text>
        ) : null}
        <Field label="Anything you want to add" description="Optional." className="mt-3">
          <Textarea
            rows={3}
            value={note}
            onChangeText={setNote}
            placeholder="Said the job needed an extra person and wanted the money in hand."
          />
        </Field>
      </ConfirmAction>

      <View className="mt-3">
        <AccessRefusal error={report.error} attempting="send this report" />
      </View>
    </View>
  );
}
