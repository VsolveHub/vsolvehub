// Ported from frontend/apps/customer/features/booking/view/cancellation-ladder.tsx
import { Badge, Text, formatMoney } from "@vsolve/mobile-ui";
import { View } from "react-native";

import { useCancellationPolicy } from "@/features/legal/queries";

export interface CancellationBandView {
  code: string;
  conditionText: string;
  feeLabel: string;
  isFree: boolean;
}

export interface CancellationLadderProps {
  bands?: CancellationBandView[];
  policyVersion?: string;
  rescheduleFreeNoticeHours?: number;
}

/**
 * The graduated cancellation ladder, shown **before** the pay action.
 *
 * Discloses concrete rupee amounts for this booking, before the Partner search
 * and before money is taken. If props are not provided, it reads the live
 * published cancellation policy.
 */
export function CancellationLadder({
  bands: propBands,
  policyVersion: propVersion,
  rescheduleFreeNoticeHours: propHours,
}: CancellationLadderProps = {}) {
  const policyQuery = useCancellationPolicy();
  const policy = policyQuery.data;

  const bands: CancellationBandView[] =
    propBands ??
    (policy?.bands.map((band) => ({
      code: band.code,
      conditionText: band.condition_text,
      feeLabel: formatMoney(band.fee.amount_paise),
      isFree: band.fee.amount_paise === 0,
    })) ??
      []);

  const policyVersion = propVersion ?? (policy?.version ? String(policy.version) : "1");
  const rescheduleFreeNoticeHours =
    propHours ?? policy?.reschedule_free_notice_hours ?? 2;

  if (bands.length === 0) return null;

  return (
    <View
      accessibilityLabel="Cancellation policy"
      className="rounded-2xl border border-line bg-surface p-4"
    >
      <Text className="text-sm font-semibold text-text">If you cancel</Text>
      <Text className="mt-1 text-sm leading-5 text-text-secondary">
        These amounts are for this booking. Changing the time is free up to{" "}
        {rescheduleFreeNoticeHours} hours before we arrive — you only pay a fee if you
        cancel.
      </Text>

      <View className="mt-3 gap-2">
        {bands.map((band, index) => (
          <View
            key={band.code}
            className={`flex-row items-center justify-between gap-4 pb-2 ${
              index < bands.length - 1 ? "border-b border-line" : ""
            }`}
          >
            <Text className="flex-1 text-sm text-text-secondary">{band.conditionText}</Text>
            {band.isFree ? (
              <Badge tone="success">Free</Badge>
            ) : (
              <Badge tone="neutral">{band.feeLabel} fee</Badge>
            )}
          </View>
        ))}
      </View>

      <Text className="mt-3 text-xs text-text-muted">Policy {policyVersion}</Text>
    </View>
  );
}
