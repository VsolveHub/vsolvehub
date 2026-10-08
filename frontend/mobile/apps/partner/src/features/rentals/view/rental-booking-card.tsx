import { Badge, Button, Card, Text } from "@vsolve/mobile-ui";
import { Alert, Linking, View } from "react-native";
import { Calendar, CheckCircle2, Phone, ShieldCheck, User } from "lucide-react-native";

import {
  canCancelBooking,
  formatPaise,
  getRentalBookingStatusBadge,
  type PartnerRentalBooking,
} from "../model";

export function RentalBookingCard({
  booking,
  onHandover,
  onReturn,
  onReleaseDeposit,
  onDisputeDeposit,
  onCancelBooking,
  onViewDetails,
}: {
  booking: PartnerRentalBooking;
  onHandover: (booking: PartnerRentalBooking) => void;
  onReturn: (booking: PartnerRentalBooking) => void;
  onReleaseDeposit: (booking: PartnerRentalBooking) => void;
  onDisputeDeposit: (booking: PartnerRentalBooking) => void;
  onCancelBooking?: (booking: PartnerRentalBooking) => void;
  onViewDetails?: (booking: PartnerRentalBooking) => void;
}) {
  const badge = getRentalBookingStatusBadge(booking.status);
  const status = (booking.status ?? "").toUpperCase();
  const cancellable = canCancelBooking(status);

  const handleCall = () => {
    if (booking.customer_phone) {
      void Linking.openURL(`tel:${booking.customer_phone}`);
    } else {
      Alert.alert("Contact Unavailable", "Customer phone number is not available.");
    }
  };

  return (
    <Card className="border border-line bg-surface p-4 shadow-sm">
      <View className="flex-row items-center justify-between border-b border-line/60 pb-3">
        <View>
          <Text className="text-xs font-semibold text-text-muted">
            Order #{booking.booking_code || booking.id.slice(0, 8).toUpperCase()}
          </Text>
          <Text className="mt-0.5 text-base font-bold text-text">
            {booking.asset?.title || "Rental Equipment"}
          </Text>
        </View>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </View>

      <View className="mt-3 flex-col gap-2">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <User size={14} color="#71717a" />
            <Text className="text-sm font-medium text-text">
              {booking.customer_name || "Customer"}
            </Text>
          </View>

          {booking.customer_phone ? (
            <Button
              variant="secondary"
              size="sm"
              onPress={handleCall}
              className="h-7 flex-row items-center gap-1.5 px-2.5"
            >
              <Phone size={12} color="#f87000" />
              <Text className="text-xs font-semibold text-[#f87000]">Call Renter</Text>
            </Button>
          ) : null}
        </View>

        <View className="flex-row items-center gap-2">
          <Calendar size={14} color="#71717a" />
          <Text className="text-xs text-text-muted">
            {booking.start_date} → {booking.end_date} ({booking.quantity ?? 1} unit)
          </Text>
        </View>
      </View>

      <View className="mt-3.5 flex-row items-center justify-between rounded-lg bg-surface-muted p-2.5">
        <View>
          <Text className="text-[11px] text-text-muted">Total Rent</Text>
          <Text className="text-sm font-bold text-text">
            {formatPaise((booking.price_paise ?? 0) + (booking.platform_fee_paise ?? 0))}
          </Text>
        </View>

        <View className="items-end">
          <Text className="text-[11px] text-text-muted">Security Deposit</Text>
          <Text className="text-sm font-bold text-emerald-600">
            {formatPaise(booking.deposit?.amount_paise ?? booking.deposit_paise ?? 0)}
          </Text>
        </View>
      </View>

      {/* Action Buttons based on lifecycle status */}
      <View className="mt-4 flex-row flex-wrap items-center justify-end gap-2">
        {onViewDetails ? (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => onViewDetails(booking)}
            className="h-8 px-2.5"
          >
            <Text className="text-xs font-semibold text-text">Details</Text>
          </Button>
        ) : null}

        {status === "CONFIRMED" ? (
          <Button
            variant="primary"
            size="sm"
            onPress={() => onHandover(booking)}
            className="h-8 flex-row items-center gap-1.5 px-3"
          >
            <CheckCircle2 size={13} color="#ffffff" />
            <Text className="text-xs font-bold text-white">Confirm Handover</Text>
          </Button>
        ) : null}

        {status === "HANDOVER" || status === "HANDED_OVER" ? (
          <Button
            variant="primary"
            size="sm"
            onPress={() => onReturn(booking)}
            className="h-8 flex-row items-center gap-1.5 px-3 bg-amber-600 active:bg-amber-700"
          >
            <CheckCircle2 size={13} color="#ffffff" />
            <Text className="text-xs font-bold text-white">Confirm Return</Text>
          </Button>
        ) : null}

        {status === "RETURNED" ? (
          <View className="flex-row items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onPress={() => onDisputeDeposit(booking)}
              className="h-8 px-3"
            >
              <Text className="text-xs font-semibold text-rose-600">Claim Damage</Text>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onPress={() => onReleaseDeposit(booking)}
              className="h-8 flex-row items-center gap-1 px-3 bg-emerald-600 active:bg-emerald-700"
            >
              <ShieldCheck size={13} color="#ffffff" />
              <Text className="text-xs font-bold text-white">Release Deposit</Text>
            </Button>
          </View>
        ) : null}

        {cancellable && onCancelBooking ? (
          <Button
            variant="outline"
            size="sm"
            onPress={() => onCancelBooking(booking)}
            className="h-8 px-2.5"
          >
            <Text className="text-xs font-medium text-text-muted">Cancel</Text>
          </Button>
        ) : null}
      </View>
    </Card>
  );
}
