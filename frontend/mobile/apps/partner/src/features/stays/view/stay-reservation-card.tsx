import { Badge, Button, Card, Text } from "@vsolve/mobile-ui";
import { Linking, Pressable, View } from "react-native";
import { Calendar, ChevronRight, Phone, User } from "lucide-react-native";

import {
  type StayReservation,
  formatPaise,
  stayReservationStatusLabel,
  stayReservationTone,
} from "../model";
import { THEME_COLORS } from "../theme-colors";

export function StayReservationCard({
  reservation,
  onSelect,
}: {
  reservation: StayReservation;
  onSelect: (reservation: StayReservation) => void;
}) {
  const tone = stayReservationTone(reservation.status);
  const statusLabel = stayReservationStatusLabel(reservation.status);

  const handleCall = () => {
    if (reservation.customer_phone) {
      void Linking.openURL(`tel:${reservation.customer_phone}`);
    }
  };

  return (
    <Card className="border border-line bg-surface p-4 shadow-sm">
      <Pressable onPress={() => onSelect(reservation)} className="flex-col gap-2.5">
        {/* Header: Property & Room + Status Badge */}
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-2">
            <Text className="text-base font-bold text-text" numberOfLines={1}>
              {reservation.property_title ?? "Stay"} · {reservation.unit_name ?? "Room"}
            </Text>
          </View>
          <Badge tone={tone}>{statusLabel}</Badge>
        </View>

        {/* Dates and Amount */}
        <View className="flex-row items-center gap-1.5">
          <Calendar size={13} color={THEME_COLORS.zinc500} />
          <Text className="text-xs text-text-secondary">
            {reservation.check_in} – {reservation.check_out}
            {typeof reservation.total_paise === "number"
              ? ` · ${formatPaise(reservation.total_paise)}`
              : ""}
          </Text>
        </View>

        {/* Guest Name & Phone */}
        <View className="flex-row items-center gap-1.5">
          <User size={13} color={THEME_COLORS.zinc500} />
          <Text className="text-xs text-text-secondary" numberOfLines={1}>
            Guest: {reservation.customer_name || "—"}
            {reservation.customer_phone ? ` · ${reservation.customer_phone}` : ""}
          </Text>
        </View>
      </Pressable>

      {/* Action Footer */}
      <View className="mt-3 flex-row items-center justify-between border-t border-line/60 pt-3">
        <Pressable
          onPress={() => onSelect(reservation)}
          className="flex-row items-center gap-1"
        >
          <Text className="text-xs font-semibold text-text-link">View booking</Text>
          <ChevronRight size={13} color={THEME_COLORS.navy900} />
        </Pressable>

        {reservation.customer_phone ? (
          <Button
            variant="secondary"
            size="sm"
            onPress={handleCall}
            className="h-8 flex-row items-center gap-1.5 px-3"
          >
            <Phone size={12} color={THEME_COLORS.navy900} />
            <Text className="text-xs font-bold text-navy-900">Call</Text>
          </Button>
        ) : null}
      </View>
    </Card>
  );
}
