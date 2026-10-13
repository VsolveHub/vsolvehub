import { Badge, Button, Card, COLOR_TOKENS, Text } from "@vsolve/mobile-ui";
import { Alert, Linking, Pressable, View } from "react-native";
import { Calendar, ChevronRight, Phone, User } from "lucide-react-native";

import {
  formatPaise,
  getRentalBookingStatusBadge,
  type PartnerRentalBooking,
} from "../model";

export function RentalBookingCard({
  booking,
  onHandover: _onHandover,
  onReturn: _onReturn,
  onReleaseDeposit: _onReleaseDeposit,
  onDisputeDeposit: _onDisputeDeposit,
  onCancelBooking: _onCancelBooking,
  onViewDetails,
}: {
  booking: PartnerRentalBooking;
  onHandover?: (booking: PartnerRentalBooking) => void;
  onReturn?: (booking: PartnerRentalBooking) => void;
  onReleaseDeposit?: (booking: PartnerRentalBooking) => void;
  onDisputeDeposit?: (booking: PartnerRentalBooking) => void;
  onCancelBooking?: (booking: PartnerRentalBooking) => void;
  onViewDetails?: (booking: PartnerRentalBooking) => void;
}) {
  const badge = getRentalBookingStatusBadge(booking.status);

  const handleCall = () => {
    if (booking.customer_phone) {
      void Linking.openURL(`tel:${booking.customer_phone}`);
    } else {
      Alert.alert("Contact Unavailable", "Customer phone number is not available.");
    }
  };

  return (
    <Pressable
      accessibilityLabel={`Booking #${booking.booking_code || booking.id.slice(0, 8)}, ${booking.asset?.title || "Rental Equipment"}`}
      onPress={() => onViewDetails?.(booking)}
      className="active:scale-[0.99]"
    >
      <Card className="border border-line bg-surface p-4 shadow-sm active:border-line-strong active:shadow-raised">
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
              <User size={14} color={COLOR_TOKENS.textMuted} />
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
                <Phone size={12} color={COLOR_TOKENS.action} />
                <Text className="text-xs font-semibold text-brand">Call Renter</Text>
              </Button>
            ) : null}
          </View>

          <View className="flex-row items-center gap-2">
            <Calendar size={14} color={COLOR_TOKENS.textMuted} />
            <Text className="text-xs text-text-muted">
              {booking.start_date} → {booking.end_date} ({booking.quantity ?? 1} unit)
            </Text>
          </View>
        </View>

        <View className="mt-3.5 flex-row items-center justify-between rounded-lg bg-surface-muted p-2.5">
          <View>
            <Text className="text-[11px] text-text-muted">Total Rent</Text>
            <Text className="text-sm font-bold text-text tabular-nums">
              {formatPaise((booking.price_paise ?? 0) + (booking.platform_fee_paise ?? 0))}
            </Text>
          </View>

          <View className="items-end">
            <Text className="text-[11px] text-text-muted">Security Deposit</Text>
            <Text className="text-sm font-bold text-success-text tabular-nums">
              {formatPaise(booking.deposit?.amount_paise ?? booking.deposit_paise ?? 0)}
            </Text>
          </View>
        </View>

        {/* D1: Single summary row action matching web parity */}
        <View className="mt-3 flex-row items-center justify-end pt-1">
          <Button
            variant="ghost"
            size="sm"
            onPress={() => onViewDetails?.(booking)}
            className="h-8 flex-row items-center gap-1 px-2"
          >
            <Text className="text-xs font-semibold text-navy-900">View booking</Text>
            <ChevronRight size={14} color={COLOR_TOKENS.text} />
          </Button>
        </View>
      </Card>
    </Pressable>
  );
}
