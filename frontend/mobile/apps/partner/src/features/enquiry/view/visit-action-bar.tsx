// Ported from frontend/apps/partner/features/visit/view/visit-action-bar.tsx
import { Button, ConfirmAction, Sheet, Text, buttonStyles } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";

import type { EnquiryRecord } from "@/features/enquiry/model/wire";
import { PARTNER_SUPPORT_PHONE } from "@/features/support/contact";
import { Pictogram } from "@/features/work-stack/view/pictogram";

import type { VisitDayControls } from "./use-visit-day";

export function VisitActionBar({
  controls,
  estimateHref,
  arrivalHref,
  showEstimateAction = true,
  estimateSubmitted = false,
  onMessageCustomer,
}: {
  readonly controls: VisitDayControls;
  readonly enquiry: EnquiryRecord;
  readonly estimateHref: string;
  readonly arrivalHref: string;
  readonly showEstimateAction?: boolean;
  readonly estimateSubmitted?: boolean;
  readonly onMessageCustomer?: () => void;
}) {
  const router = useRouter();
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const [reportingNoShow, setReportingNoShow] = useState(false);
  const [showingTrouble, setShowingTrouble] = useState(false);
  const { visit, permissions, timing, pending, askingForCode } = controls;

  const troubleAvailable = permissions.canReportCustomerNoShow || visit.status === "SCHEDULED";
  const showArrive = controls.canStartArrival;
  const showFinish = permissions.canComplete;
  const showEstimate = permissions.canEstimate && showEstimateAction;
  const showCalendar = !showArrive && !showFinish && !showEstimate && visit.status === "SCHEDULED";
  if (!showArrive && !showFinish && !showEstimate && !showCalendar && !troubleAvailable) return null;

  return (
    <View>
      <View className="gap-2 border-t border-line bg-surface px-4 pb-5 pt-3">
        {showArrive ? (
          askingForCode ? (
            <Pressable accessibilityRole="button" className={buttonStyles({ className: "w-full" })} onPress={() => router.push(arrivalHref as never)}>
              <Text className="text-sm font-semibold text-action-text">Start OTP</Text>
            </Pressable>
          ) : (
            <Button disabled={pending} onPress={() => controls.setAskingForCode(true)}>I've arrived</Button>
          )
        ) : null}
        {showFinish ? (
          <Button disabled={pending} onPress={() => setConfirmingComplete(true)}>Finish the visit</Button>
        ) : null}
        {showEstimate ? (
          <Pressable accessibilityRole="button" className={buttonStyles({ className: "w-full" })} onPress={() => router.push(estimateHref as never)}>
            <Text className="text-sm font-semibold text-action-text">{estimateSubmitted ? "Revise estimate" : "Write the estimate"}</Text>
          </Pressable>
        ) : null}
        {showCalendar && timing ? (
          <Text className="text-center text-sm text-text-secondary">{timing.fullLabel}</Text>
        ) : null}
        {troubleAvailable ? (
          <Pressable accessibilityRole="button" onPress={() => setShowingTrouble(true)} className="min-h-11 items-center justify-center">
            <Text className="text-sm font-semibold text-text-secondary">Something’s wrong with this visit ›</Text>
          </Pressable>
        ) : null}
      </View>
      <Sheet open={showingTrouble} onOpenChange={setShowingTrouble} title="Something's wrong" description={timing ? timing.fullLabel : undefined}>
        <View className="flex-col gap-3">
          {permissions.canReportCustomerNoShow ? (
            <Pressable accessibilityRole="button" onPress={() => { setShowingTrouble(false); setReportingNoShow(true); }} className="rounded-card border border-line bg-surface p-3.5">
              <Text className="text-sm font-bold text-text">Nobody was there</Text>
              <Text className="text-xs leading-5 text-text-secondary">You reached the site and the customer was not there.</Text>
            </Pressable>
          ) : null}
          {onMessageCustomer === undefined ? null : (
            <Pressable accessibilityRole="button" onPress={() => { setShowingTrouble(false); onMessageCustomer(); }} className="rounded-card border border-line bg-surface p-3.5">
              <Text className="text-sm font-bold text-text">Message the customer</Text>
              <Text className="text-xs leading-5 text-text-secondary">Ask a question about access, parking or the work itself.</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(`tel:${PARTNER_SUPPORT_PHONE}`)} className="flex-row items-start gap-3 rounded-card border border-line bg-surface p-3.5">
            <Pictogram name="call" size="sm" className="text-text-secondary" />
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-bold text-text">Call Vsolve support</Text>
              <Text className="text-xs leading-5 text-text-secondary">Schedule changes, site access, safety.</Text>
            </View>
          </Pressable>
        </View>
      </Sheet>
      <ConfirmAction
        open={confirmingComplete}
        onOpenChange={setConfirmingComplete}
        title="Finish this visit"
        consequence="Finishing the visit starts the estimate timer. Send the estimate before it ends."
        confirmLabel="Finish the visit"
        pending={controls.complete.isPending}
        onConfirm={() => controls.complete.mutate({ siteVisitId: visit.id }, { onSuccess: () => setConfirmingComplete(false) })}
      />
      <ConfirmAction
        open={reportingNoShow}
        onOpenChange={setReportingNoShow}
        title="Report that nobody was on site"
        consequence="Use this only if you reached the site and the customer was not there."
        confirmLabel="Report it"
        destructive
        pending={controls.noShow.isPending}
        onConfirm={() => controls.noShow.mutate({ siteVisitId: visit.id }, { onSuccess: () => setReportingNoShow(false) })}
      />
    </View>
  );
}
