// Ported from frontend/apps/partner/features/support/view/booking-support.tsx
import { Card, Text, buttonStyles } from "@vsolve/mobile-ui";
import { Mail, MessageCircle, Phone } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";

import { PARTNER_SUPPORT_PHONE as PHONE } from "@/features/support/contact";

export function BookingSupport({ reference }: { readonly reference: string }) {
  const [open, setOpen] = useState(false);
  const message = encodeURIComponent(`Hi VsolveHub Partner Support, I need help with job ${reference}.`);
  const subject = encodeURIComponent(`Partner job support · ${reference}`);

  return (
    <Card className="p-0">
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((current) => !current)}
        className="min-h-16 flex-row items-center gap-3 px-4 py-3"
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-action-soft">
          <Phone size={20} color="#f87000" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-semibold text-text">Booking support</Text>
          <Text className="text-xs text-text-secondary">Schedule, customer, payment or safety</Text>
        </View>
        <Text className="text-xl text-text-muted">{open ? "–" : "+"}</Text>
      </Pressable>
      {open ? (
        <View className="border-t border-line px-4 py-4">
          <Text className="text-sm leading-6 text-text-secondary">
            Contact us about schedule changes, site or customer issues, payment and invoice questions, damage or safety, or help after completion.
          </Text>
          <View className="mt-3 gap-2">
            <Pressable accessibilityRole="button" className={buttonStyles({ variant: "outline" })} onPress={() => void Linking.openURL(`https://wa.me/${PHONE.slice(1)}?text=${message}`)}>
              <MessageCircle size={17} color="#00112e" />
              <Text className="text-sm font-semibold text-text">WhatsApp</Text>
            </Pressable>
            <Pressable accessibilityRole="button" className={buttonStyles({ variant: "outline" })} onPress={() => void Linking.openURL(`tel:${PHONE}`)}>
              <Phone size={17} color="#00112e" />
              <Text className="text-sm font-semibold text-text">Call</Text>
            </Pressable>
            <Pressable accessibilityRole="button" className={buttonStyles({ variant: "outline" })} onPress={() => void Linking.openURL(`mailto:support@vsolvehub.com?subject=${subject}`)}>
              <Mail size={17} color="#00112e" />
              <Text className="text-sm font-semibold text-text">Email</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Card>
  );
}
