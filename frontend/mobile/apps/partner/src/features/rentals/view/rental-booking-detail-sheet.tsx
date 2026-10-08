import { Badge, Button, Dialog, Text } from "@vsolve/mobile-ui";
import { Alert, Linking, ScrollView, View } from "react-native";
import { Calendar, Clock, Phone, User } from "lucide-react-native";

import {
  canCancelBooking,
  formatPaise,
  getRentalBookingStatusBadge,
  type PartnerRentalBooking,
} from "../model";

export function RentalBookingDetailSheet({
  booking,
  open,
  onOpenChange,
  onHandover,
  onReturn,
  onReleaseDeposit,
  onDisputeDeposit,
  onCancelBooking,
}: {
  booking: PartnerRentalBooking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHandover: (booking: PartnerRentalBooking) => void;
  onReturn: (booking: PartnerRentalBooking) => void;
  onReleaseDeposit: (booking: PartnerRentalBooking) => void;
  onDisputeDeposit: (booking: PartnerRentalBooking) => void;
  onCancelBooking: (booking: PartnerRentalBooking) => void;
}) {
  if (!booking) return null;

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
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={booking.asset?.title || "Booking Details"}
      description={`Order #${booking.booking_code || booking.id.slice(0, 8).toUpperCase()}`}
    >
      <ScrollView className="max-h-[75vh] gap-4 py-2" showsVerticalScrollIndicator={false}>
        <View className="flex-row items-center justify-between border-b border-line/60 pb-3">
          <Text className="text-xs font-semibold text-text-muted">Current Lifecycle</Text>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </View>

        {/* Customer Info Card */}
        <View className="gap-2 rounded-2xl border border-line bg-surface p-3.5">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Renter Details
          </Text>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <User size={15} color="#071328" />
              <Text className="text-sm font-bold text-navy-900">
                {booking.customer_name || "Customer"}
              </Text>
            </View>
            {booking.customer_phone ? (
              <Button
                variant="secondary"
                size="sm"
                onPress={handleCall}
                className="h-7 flex-row items-center gap-1.5 px-3"
              >
                <Phone size={12} color="#f87000" />
                <Text className="text-xs font-semibold text-[#f87000]">{booking.customer_phone}</Text>
              </Button>
            ) : null}
          </View>
        </View>

        {/* Schedule */}
        <View className="gap-2 rounded-2xl border border-line bg-canvas p-3.5">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Schedule & Units
          </Text>
          <View className="flex-row items-center gap-2">
            <Calendar size={14} color="#6B6560" />
            <Text className="text-xs text-text-secondary">
              Period: <Text className="font-bold text-navy-900">{booking.start_date} → {booking.end_date}</Text>
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Clock size={14} color="#6B6560" />
            <Text className="text-xs text-text-secondary">
              Units: <Text className="font-bold text-navy-900">{booking.quantity ?? 1} unit(s)</Text>
            </Text>
          </View>
          {booking.notes ? (
            <Text className="mt-1 text-xs italic text-text-muted">
              Notes: &quot;{booking.notes}&quot;
            </Text>
          ) : null}
        </View>

        {/* Financial Breakdown */}
        <View className="gap-2 rounded-2xl border border-line bg-surface p-3.5">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Financials
          </Text>
          <View className="flex-row justify-between">
            <Text className="text-xs text-text-secondary">Rental Charges</Text>
            <Text className="text-xs font-bold text-navy-900">
              {formatPaise((booking.price_paise ?? 0) + (booking.platform_fee_paise ?? 0))}
            </Text>
          </View>
          {(booking.platform_fee_paise ?? 0) > 0 ? (
            <View className="flex-row justify-between">
              <Text className="text-xs text-text-secondary">
                Platform fee ({booking.platform_fee_percent ?? 0}%)
              </Text>
              <Text className="text-xs font-bold text-navy-900">
                {formatPaise(booking.platform_fee_paise ?? 0)}
              </Text>
            </View>
          ) : null}
          <View className="flex-row justify-between">
            <Text className="text-xs text-text-secondary">Security Deposit</Text>
            <Text className="text-xs font-bold text-emerald-600">
              {formatPaise(booking.deposit?.amount_paise ?? booking.deposit_paise ?? 0)}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-xs text-text-secondary">Deposit Status</Text>
            <Text className="text-xs font-bold text-navy-900">
              {booking.deposit?.status || "HELD"}
            </Text>
          </View>
        </View>

        {/* Action Controls */}
        <View className="gap-2 pt-2">
          {status === "CONFIRMED" ? (
            <Button
              variant="primary"
              onPress={() => {
                onOpenChange(false);
                onHandover(booking);
              }}
              className="w-full py-2.5"
            >
              <Text className="font-bold text-white">Confirm Handover (Requires PIN)</Text>
            </Button>
          ) : null}

          {status === "HANDOVER" || status === "HANDED_OVER" ? (
            <Button
              variant="primary"
              onPress={() => {
                onOpenChange(false);
                onReturn(booking);
              }}
              className="w-full py-2.5 bg-amber-600 active:bg-amber-700"
            >
              <Text className="font-bold text-white">Confirm Return</Text>
            </Button>
          ) : null}

          {status === "RETURNED" ? (
            <View className="flex-row gap-2">
              <Button
                variant="secondary"
                onPress={() => {
                  onOpenChange(false);
                  onDisputeDeposit(booking);
                }}
                className="flex-1 py-2.5"
              >
                <Text className="font-bold text-rose-600">Claim Damage</Text>
              </Button>
              <Button
                variant="primary"
                onPress={() => {
                  onOpenChange(false);
                  onReleaseDeposit(booking);
                }}
                className="flex-1 py-2.5 bg-emerald-600 active:bg-emerald-700"
              >
                <Text className="font-bold text-white">Release Deposit</Text>
              </Button>
            </View>
          ) : null}

          {cancellable ? (
            <Button
              variant="outline"
              onPress={() => {
                onOpenChange(false);
                onCancelBooking(booking);
              }}
              className="w-full py-2.5"
            >
              <Text className="font-semibold text-text-secondary">Cancel Booking</Text>
            </Button>
          ) : null}
        </View>
      </ScrollView>
    </Dialog>
  );
}
