import { Badge, Button, Card, Text } from "@vsolve/mobile-ui";
import { Linking, Pressable, View } from "react-native";
import { Calendar, ChevronRight, Phone, User } from "lucide-react-native";

import {
  type StayEnquiry,
  formatPaise,
  getEnquiryStatusBadge,
  stayLengthLabel,
} from "../model";

const OPEN_STATUSES = new Set(["SUBMITTED", "RESPONDED", "OPEN"]);

export function EnquiryCard({
  enquiry,
  onSelect,
}: {
  enquiry: StayEnquiry;
  onSelect: (enquiry: StayEnquiry) => void;
}) {
  const badge = getEnquiryStatusBadge(enquiry.status);
  const status = (enquiry.status ?? "").toUpperCase();
  const isOpen = OPEN_STATUSES.has(status);

  const durationStr = enquiry.stay_length
    ? stayLengthLabel(enquiry.stay_length, enquiry.price_period)
    : stayLengthLabel(enquiry.length ?? 1, enquiry.price_period);

  const guestsStr =
    enquiry.adult_count !== undefined
      ? `${enquiry.adult_count} adult${enquiry.adult_count === 1 ? "" : "s"}${enquiry.child_count ? `, ${enquiry.child_count} child` : ""}`
      : `${enquiry.guest_count ?? 1} guest${(enquiry.guest_count ?? 1) === 1 ? "" : "s"}`;

  const handleCall = () => {
    if (enquiry.user_phone) {
      void Linking.openURL(`tel:${enquiry.user_phone}`);
    }
  };

  return (
    <Card className="border border-line bg-surface p-4 shadow-sm">
      <Pressable onPress={() => onSelect(enquiry)} className="flex-col gap-2.5">
        {/* Header: Guest Name & Status Badge */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <User size={15} color="#71717a" />
            <Text className="text-base font-bold text-text">
              {enquiry.user_name || "Guest"}
            </Text>
          </View>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </View>

        {/* Property & Room unit */}
        <Text className="text-xs text-text-muted" numberOfLines={1}>
          {enquiry.property?.title || enquiry.property_title || "Stay Property"} ·{" "}
          {enquiry.unit?.name || enquiry.unit_name || "Room"}
        </Text>

        {/* Move-in, duration & guests */}
        <View className="flex-row items-center gap-1.5">
          <Calendar size={13} color="#71717a" />
          <Text className="text-xs text-text-secondary">
            From {enquiry.check_in} · {durationStr} · {guestsStr}
          </Text>
        </View>

        {/* Estimate if exists */}
        {enquiry.total_quote_paise ? (
          <View className="flex-row items-center gap-1">
            <Text className="text-xs text-text-muted">Estimate:</Text>
            <Text className="text-xs font-bold text-[#f87000]">
              {formatPaise(enquiry.total_quote_paise)}
            </Text>
          </View>
        ) : null}

        {/* Message preview */}
        {enquiry.message ? (
          <View className="mt-0.5 rounded-lg bg-surface-muted p-2">
            <Text className="text-xs text-text-muted" numberOfLines={2}>
              &ldquo;{enquiry.message}&rdquo;
            </Text>
          </View>
        ) : null}
      </Pressable>

      {/* Action Footer */}
      <View className="mt-3 flex-row items-center justify-between border-t border-line/60 pt-3">
        <Pressable
          onPress={() => onSelect(enquiry)}
          className="flex-row items-center gap-1"
        >
          <Text className="text-xs font-semibold text-[#071328]">Details</Text>
          <ChevronRight size={13} color="#071328" />
        </Pressable>

        {enquiry.user_phone && isOpen ? (
          <Button
            variant="primary"
            size="sm"
            onPress={handleCall}
            className="h-8 flex-row items-center gap-1.5 px-3"
          >
            <Phone size={12} color="#ffffff" />
            <Text className="text-xs font-bold text-white">Call</Text>
          </Button>
        ) : null}
      </View>
    </Card>
  );
}
