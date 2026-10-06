// Ported from frontend/apps/customer/features/crew/view/mobile/rate-screen.tsx
import { Button } from "@vsolve/mobile-ui";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "@vsolve/mobile-ui";

import { toRateTermsView, type RateDisclosureView } from "../adapters";
import { PhoneFrame } from "./phone-frame";
import { RateTermsLink } from "./rate-terms-sheet";

export function RateScreen({
  rate,
  isStale = false,
  onBack,
  onBook,
  isBooking,
  notice,
  unavailable,
  summary,
  crewLabel,
}: {
  rate: RateDisclosureView | null;
  isStale?: boolean;
  onBack: () => void;
  onBook: () => void;
  isBooking: boolean;
  notice?: ReactNode;
  unavailable?: ReactNode;
  summary?: ReactNode;
  crewLabel?: string;
}) {
  return (
    <PhoneFrame
      title="Our rate for this"
      onBack={onBack}
      step="Step 3 of 3"
      action={
        unavailable === undefined && rate !== null ? (
          <Button block onPress={onBook} loading={isBooking} loadingLabel="Booking your crew" className="h-[50px] rounded-[11px]">
            {`Book — pay ${rate.bookingFeeLabel} when accepted`}
          </Button>
        ) : undefined
      }
    >
      <View className="gap-3" accessibilityState={{ busy: isStale || undefined }}>
        {notice}
        {unavailable !== undefined ? (
          unavailable
        ) : rate === null ? null : (
          <View className="gap-3">
            {summary}
            <View className="rounded-2xl border border-line bg-surface p-4">
              <Text className="text-sm font-semibold text-text">
                {rate.dayRateLabel} {crewLabel ?? "a day to the crew"}
              </Text>
              <Text className="mt-1 text-sm text-text-secondary">
                {rate.bookingFeeLabel} booking fee when a supervisor accepts
              </Text>
            </View>
            <RateTermsLink terms={toRateTermsView(rate)} />
          </View>
        )}
      </View>
    </PhoneFrame>
  );
}
