// Ported from frontend/apps/partner/features/enquiry/view/customer-card.tsx
import { Card, Text, buttonStyles } from "@vsolve/mobile-ui";
import { MessageCircle, Phone, User } from "lucide-react-native";
import { Linking, Pressable, View } from "react-native";

import type { EnquiryRecord } from "../model/wire";

export interface CustomerCardProps {
  readonly enquiry: EnquiryRecord;
  readonly onMessage: () => void;
}

export function CustomerCard({ enquiry, onMessage }: CustomerCardProps) {
  if (enquiry.customerName === null) return null;
  return (
    <Card className="flex-col gap-3 p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-sunken">
          <User size={19} color="#00246b" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Visiting</Text>
          <Text numberOfLines={1} className="text-base font-bold text-text">{enquiry.customerName}</Text>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {enquiry.customerPhone === null ? (
          <Text className="w-[48%] items-center justify-center rounded-control border border-dashed border-line px-3 py-2 text-center text-xs font-semibold leading-4 text-text-muted">
            Phone unlocks 2 h before
          </Text>
        ) : (
          <Pressable accessibilityRole="button" className={buttonStyles({ variant: "outline", className: "w-[48%]" })} onPress={() => void Linking.openURL(`tel:${enquiry.customerPhone}`)}>
            <Phone size={16} color="#00112e" />
            <Text className="text-sm font-semibold text-text">Call</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={onMessage} className={buttonStyles({ variant: "outline", className: "w-[48%]" })}>
          <MessageCircle size={16} color="#00112e" />
          <Text className="text-sm font-semibold text-text">Message</Text>
        </Pressable>
      </View>
    </Card>
  );
}
