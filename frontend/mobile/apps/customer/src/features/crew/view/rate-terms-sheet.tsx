// Ported from frontend/apps/customer/features/crew/view/rate-terms-sheet.tsx
import { Sheet, Text } from "@vsolve/mobile-ui";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import type { AddOnRateView, RateTermsView } from "../adapters";
import { WageLine } from "./wage-line";

export function RateTermsSheet({
  terms,
  open,
  onOpenChange,
}: {
  terms: RateTermsView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Rate & terms">
      <View className="gap-4 pb-2">
        <Row
          term={`${terms.dayRateLabel} per person per day`}
          detail="Our published rate for this work in this city — not a starting point negotiated on site."
        />
        {terms.standardDayHours !== null ? (
          <Row
            term={`${terms.standardDayHours}-hour day`}
            detail={
              terms.overtimeHourlyLabel === null
                ? "What counts as one shift."
                : `After that, overtime is ${terms.overtimeHourlyLabel} per person per hour — only once you approve it in the app.`
            }
          />
        ) : null}
        {terms.inclusions.length > 0 ? (
          <Row term="Included">
            <View className="mt-1 gap-1">
              {terms.inclusions.map((line) => (
                <Text key={line} className="text-sm text-text-secondary">
                  • {line}
                </Text>
              ))}
            </View>
          </Row>
        ) : null}
        {terms.addOns.length > 0 ? (
          <Row term="Add-ons, published in advance">
            <View className="mt-1 gap-1">
              {terms.addOns.map((addOn: AddOnRateView) => (
                <View key={addOn.code} className="flex-row items-baseline justify-between gap-3">
                  <Text className="text-sm text-text-secondary">{addOn.label}</Text>
                  <Text className="shrink-0 text-sm font-medium text-text">{addOn.amountLabel}</Text>
                </View>
              ))}
            </View>
          </Row>
        ) : null}
        <Row
          term={`${terms.bookingFeeLabel} booking fee`}
          detail="Now, on UPI, to Vsolve. Refunded if nobody arrives; part of it is kept only if you cancel inside the free window."
        />
        <Row
          term={`${terms.leadDayReceiptLabel} a day to the crew`}
          detail="Paid by you directly, each evening — never a number agreed at your door."
        />
        <WageLine />
      </View>
    </Sheet>
  );
}

function Row({ term, detail, children }: { term: string; detail?: string; children?: ReactNode }) {
  return (
    <View>
      <Text className="text-sm font-semibold text-text">{term}</Text>
      {detail !== undefined ? <Text className="mt-0.5 text-sm leading-6 text-text-secondary">{detail}</Text> : null}
      {children}
    </View>
  );
}

export function RateTermsLink({ terms }: { terms: RateTermsView }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} className="flex-row items-center gap-1">
        <Text className="text-sm font-medium text-text-link">ⓘ Rate & terms</Text>
      </Pressable>
      <RateTermsSheet terms={terms} open={open} onOpenChange={setOpen} />
    </>
  );
}
