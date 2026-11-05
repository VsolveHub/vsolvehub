// Ported from frontend/apps/partner/features/support/view/booking-support.tsx
import { Card, Text } from "@vsolve/mobile-ui";
import { ChevronDown, Mail, MessageCircle, Phone, type LucideIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Animated, Linking, Pressable, View } from "react-native";

import { PARTNER_SUPPORT_PHONE as PHONE } from "@/features/support/contact";

/**
 * Getting help on a job: one row that opens three one-tap ways to reach us. `children` are further
 * rows that belong in the same card (handing the job back), so "need help" is one tidy place.
 */
export function BookingSupport({ reference, children }: { readonly reference: string; readonly children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [turn] = useState(() => new Animated.Value(0));
  const message = encodeURIComponent(`Hi VsolveHub Partner Support, I need help with job ${reference}.`);
  const subject = encodeURIComponent(`Partner job support · ${reference}`);

  const toggle = () => {
    Animated.timing(turn, { toValue: open ? 0 : 1, duration: 180, useNativeDriver: true }).start();
    setOpen(!open);
  };
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <Card className="overflow-hidden p-0">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        className="min-h-16 flex-row items-center gap-3 px-4 py-3 active:bg-surface-sunken"
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-action-soft">
          <Phone size={20} color="#f87000" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-semibold text-text">Booking support</Text>
          <Text className="text-xs text-text-secondary">Schedule, customer, payment or safety</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <ChevronDown size={20} color="#6b7280" />
        </Animated.View>
      </Pressable>
      {open ? (
        <View className="flex-row gap-2 border-t border-line p-3">
          <ContactTile icon={MessageCircle} label="WhatsApp" onPress={() => void Linking.openURL(`https://wa.me/${PHONE.slice(1)}?text=${message}`)} />
          <ContactTile icon={Phone} label="Call" onPress={() => void Linking.openURL(`tel:${PHONE}`)} />
          <ContactTile icon={Mail} label="Email" onPress={() => void Linking.openURL(`mailto:support@vsolvehub.com?subject=${subject}`)} />
        </View>
      ) : null}
      {children ? <View className="border-t border-line">{children}</View> : null}
    </Card>
  );
}

function ContactTile({ icon: Icon, label, onPress }: { readonly icon: LucideIcon; readonly label: string; readonly onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-16 flex-1 items-center justify-center gap-1 rounded-2xl bg-surface-sunken py-2 active:opacity-70"
    >
      <Icon size={20} color="#00112e" />
      <Text className="text-xs font-semibold text-text">{label}</Text>
    </Pressable>
  );
}
