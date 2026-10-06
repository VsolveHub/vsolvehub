// Ported from frontend/apps/customer/features/quotes/view/selection-status.tsx
import { Badge, Button, Text, buttonStyles } from "@vsolve/mobile-ui";
import { Link } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { engagementHref } from "@/lib/routes";

import type { SelectionView } from "../adapters";

export interface SelectionStatusProps {
  selection: SelectionView;
  vendorName: string | null;
  reconfirmRemaining: string | null;
  onChooseAnother?: () => void;
  supportAction?: ReactNode;
}

export function SelectionStatus({
  selection,
  vendorName,
  reconfirmRemaining,
  onChooseAnother,
  supportAction,
}: SelectionStatusProps) {
  const who = vendorName ?? "the professional you chose";

  switch (selection.status) {
    case "PENDING_RECONFIRMATION":
      return (
        <Panel tone="warning" badge={<Badge tone="warning" dot>Waiting</Badge>} title={`${who} has not confirmed yet`}>
          <Text className="text-sm leading-6 text-text">
            <Text className="font-semibold">This is not a booking yet.</Text> We have asked them to confirm the price, the date and that they have the people free. Do not change your plans until they have.
          </Text>
          {reconfirmRemaining !== null ? (
            <Text className="mt-2 text-sm text-text-secondary">
              They have {reconfirmRemaining.replace(/ left$/, "")} to answer.
            </Text>
          ) : (
            <Text className="mt-2 text-sm text-text-secondary">
              We have not set a deadline for this area yet, so we cannot tell you when they must answer by.
            </Text>
          )}
          <Text className="mt-2 text-sm leading-6 text-text-secondary">
            If they say no or run out of time, the other quotes are still yours to read and choose from — at no extra charge.
          </Text>
        </Panel>
      );

    case "DECLINED":
    case "EXPIRED":
      return (
        <Panel
          tone="warning"
          badge={<Badge tone="warning">Not going ahead</Badge>}
          title={selection.status === "DECLINED" ? `${who} could not take this on` : `${who} did not answer in time`}
        >
          <Text className="text-sm leading-6 text-text">
            Nothing is lost. Every other quote on this request is still here, still readable, and{" "}
            <Text className="font-semibold">choosing another one costs you nothing more</Text>
            {" — what you already paid still covers it."}
          </Text>
          {selection.declineReasonCode !== null ? (
            <Text className="mt-2 text-sm text-text-secondary">Their reason: {selection.declineReasonCode}</Text>
          ) : null}
          <View className="mt-3 flex-row flex-wrap gap-2">
            {onChooseAnother !== undefined ? (
              <Button onPress={onChooseAnother}>Choose another</Button>
            ) : null}
            {supportAction}
          </View>
        </Panel>
      );

    case "CONFIRMED":
      return (
        <Panel tone="success" badge={<Badge tone="success">Booked</Badge>} title={`${who} is booked`}>
          <Text className="text-sm leading-6 text-text">
            <Text className="font-semibold">This is booked.</Text> We checked they are approved for this work and free on your dates before letting you choose them, so there is nothing left for them to confirm.
          </Text>
          {selection.engagementId !== null ? (
            <View className="mt-3">
              <Link href={engagementHref(selection.engagementId) as never} asChild>
                <Pressable accessibilityRole="button" className={buttonStyles({ variant: "primary" })}>
                  <Text className="text-sm font-semibold text-action-text">See what happens next</Text>
                </Pressable>
              </Link>
            </View>
          ) : (
            <Text className="mt-2 text-sm text-text-secondary">
              We are opening the agreement now. Refresh in a moment.
            </Text>
          )}
        </Panel>
      );

    case "WITHDRAWN":
      return (
        <Panel tone="neutral" badge={<Badge tone="neutral">Withdrawn</Badge>} title="You took this choice back">
          <Text className="text-sm leading-6 text-text-secondary">
            The other quotes are still here and choosing one costs nothing more.
          </Text>
          {onChooseAnother !== undefined ? (
            <View className="mt-3">
              <Button onPress={onChooseAnother}>Choose another</Button>
            </View>
          ) : null}
        </Panel>
      );

    default:
      return (
        <Panel tone="neutral" badge={<Badge tone="neutral">Unknown</Badge>} title="We cannot describe this yet">
          <Text className="text-sm leading-6 text-text-secondary">
            Something about your choice has changed and this version of the app cannot explain it. Nothing has been charged.
          </Text>
          {supportAction !== undefined ? <View className="mt-3">{supportAction}</View> : null}
        </Panel>
      );
  }
}

const PANEL_TONES: Record<"warning" | "success" | "neutral", string> = {
  warning: "border-warning-line bg-warning-surface",
  success: "border-success-line bg-success-surface",
  neutral: "border-line bg-surface-sunken",
};

function Panel({
  tone,
  badge,
  title,
  children,
}: {
  tone: "warning" | "success" | "neutral";
  badge: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <View accessibilityLiveRegion="polite" className={`rounded-card border p-4 ${PANEL_TONES[tone]}`}>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 font-semibold text-text">{title}</Text>
        <View className="shrink-0">{badge}</View>
      </View>
      <View className="mt-2 gap-0">{children}</View>
    </View>
  );
}
