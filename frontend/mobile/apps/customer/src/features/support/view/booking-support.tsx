// Ported from frontend/apps/customer/features/support/view/booking-support.tsx
import { Card, Text, buttonStyles } from "@vsolve/mobile-ui";
import { ChevronDown, CircleHelp, HelpCircle } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";

import { SUPPORT } from "@/lib/support";

const BOOKING_FAQS: readonly {
  id: string;
  question: string;
  answer: string;
}[] = [
  {
    id: "faq-reschedule",
    question: "Can I reschedule this visit?",
    answer:
      "When this visit can be moved, Reschedule is on this page. It uses the same arrival windows as booking. If it cannot be moved, the reason is shown next to the button.",
  },
  {
    id: "faq-cancellation",
    question: "How does cancellation & refund work?",
    answer:
      "You can cancel a service request without penalty before a professional is assigned and accepts. Once a specialist is matched, a late cancellation fee may apply depending on the proximity to the service start time. When cancel is offered on this page, the fee and refund are shown before you confirm.",
  },
  {
    id: "faq-invoice",
    question: "How do I get my invoice?",
    answer:
      "When payment has been captured, use View your receipt on this page. The receipt is the invoice for this booking.",
  },
  {
    id: "faq-professional",
    question: "Where can I see my professional details?",
    answer:
      "Assigned professional details are on this booking page after payment — name, services and experience. They stay hidden until the booking is paid for.",
  },
  {
    id: "faq-support",
    question: "How do I contact support?",
    answer:
      "Use WhatsApp, Call or Email below. Keep this booking reference ready so we can find the right visit.",
  },
];

export function BookingSupport({
  reference,
  variant = "compact",
}: {
  readonly reference: string;
  readonly variant?: "compact" | "faq";
}) {
  const [open, setOpen] = useState(variant === "faq");
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  const message = encodeURIComponent(`Hi VsolveHub, I need help with booking ${reference}.`);
  const subject = encodeURIComponent(`Booking support · ${reference}`);

  return (
    <View className={variant === "faq" ? undefined : "mt-6"}>
      <Card className="p-0 overflow-hidden">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Need help with this booking?"
          onPress={() => setOpen((prev) => !prev)}
          className="flex-row items-center gap-3 p-4 min-h-16 active:bg-surface-hover"
        >
          <View className="size-10 rounded-full bg-action-soft items-center justify-center">
            {variant === "faq" ? (
              <CircleHelp size={20} color="#EA580C" />
            ) : (
              <HelpCircle size={20} color="#EA580C" />
            )}
          </View>
          <View className="flex-1 min-w-0">
            <Text className="font-semibold text-text">Need help with this booking?</Text>
            <Text className="text-xs text-text-secondary mt-0.5">
              Schedule, professional, payment, invoice or safety
            </Text>
          </View>
          <Text className="text-xl text-text-muted">{open ? "−" : "+"}</Text>
        </Pressable>

        {open ? (
          <View className="border-t border-line p-4 gap-4">
            {variant === "faq" ? (
              <View className="divide-y divide-line rounded-control border border-line overflow-hidden mb-2">
                {BOOKING_FAQS.map((item) => {
                  const isOpen = openFaq === item.id;
                  return (
                    <View key={item.id}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setOpenFaq(isOpen ? null : item.id)}
                        className="flex-row items-center justify-between p-3 min-h-11 active:bg-surface-hover"
                      >
                        <Text className="text-sm font-medium text-text flex-1 pr-2">
                          {item.question}
                        </Text>
                        <ChevronDown
                          size={16}
                          color="#64748B"
                          style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }}
                        />
                      </Pressable>
                      {isOpen ? (
                        <View className="px-3 pb-3">
                          <Text className="text-sm leading-6 text-text-secondary">
                            {item.answer}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text className="text-sm leading-6 text-text-secondary">
                Keep this reference ready. Choose the quickest channel for scheduling, a professional
                issue, payment or invoice help, damage or safety, and post-service support.
              </Text>
            )}

            <View className="gap-2">
              {SUPPORT.phone ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void Linking.openURL(`${SUPPORT.phone!.whatsappHref}?text=${message}`)}
                    className={buttonStyles({ variant: "outline", block: true })}
                  >
                    <Text className="text-sm font-semibold text-text">WhatsApp</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void Linking.openURL(SUPPORT.phone!.telHref)}
                    className={buttonStyles({ variant: "outline", block: true })}
                  >
                    <Text className="text-sm font-semibold text-text">Call</Text>
                  </Pressable>
                </>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => void Linking.openURL(`mailto:${SUPPORT.email}?subject=${subject}`)}
                className={buttonStyles({ variant: "outline", block: true })}
              >
                <Text className="text-sm font-semibold text-text">Email</Text>
              </Pressable>
            </View>

            <Text className="text-xs text-text-muted">
              For immediate danger, contact local emergency services first.
            </Text>
          </View>
        ) : null}
      </Card>
    </View>
  );
}

