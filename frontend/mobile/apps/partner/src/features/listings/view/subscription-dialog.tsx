import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Badge, Button, Text } from "@vsolve/mobile-ui";
import { Check, Crown, X } from "lucide-react-native";

import type { VendorSubscriptionPlan } from "../model";

const CAPABILITY_LABELS: Record<string, string> = {
  FEATURED_PLACEMENT: "Featured jobs",
  CANDIDATE_MATCHING: "Candidate matching & invites",
  CANDIDATE_CONTACT: "Direct candidate contact access",
};

function formatCapability(entry: any): string {
  if (typeof entry === "string") {
    return CAPABILITY_LABELS[entry] ?? entry.replace(/_/g, " ");
  }
  if (entry && typeof entry === "object" && "code" in entry) {
    return String(entry.code).replace(/_/g, " ");
  }
  return "";
}

export interface SubscriptionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  plans: VendorSubscriptionPlan[];
  currentPlanName?: string;
  onSubscribe: (planId: string) => Promise<void> | void;
  isPending?: boolean;
  error?: string | null;
}

export function SubscriptionDialog({
  isOpen,
  onClose,
  plans,
  currentPlanName,
  onSubscribe,
  isPending = false,
  error,
}: SubscriptionDialogProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/60">
        <View className="max-h-[85%] rounded-t-3xl bg-surface p-5">
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-line pb-4">
            <View className="flex-row items-center gap-2.5">
              <View className="size-9 items-center justify-center rounded-full bg-signal-100">
                <Crown size={20} color="#eab308" />
              </View>
              <View>
                <Text className="text-base font-extrabold text-navy-900">
                  Hiring Subscription Plans
                </Text>
                <Text className="text-xs text-text-muted">
                  Upgrade your listing capacity and unlock candidate matches
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close"
              className="size-8 items-center justify-center rounded-full bg-surface-muted"
            >
              <X size={18} color="#00112e" />
            </Pressable>
          </View>

          {/* Error Banner */}
          {error ? (
            <View className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
              <Text className="text-xs text-red-700">{error}</Text>
            </View>
          ) : null}

          {/* Plan Cards */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 16, gap: 12 }}
          >
            {plans.map((plan) => {
              const priceInRupees = plan.price_paise / 100;
              const isCurrent = currentPlanName === plan.name;
              const rawCapabilities = Array.isArray(plan.premium_capabilities)
                ? plan.premium_capabilities
                : [];
              const capabilities = rawCapabilities
                .map(formatCapability)
                .filter(Boolean);

              return (
                <View
                  key={plan.id}
                  className={`rounded-2xl border p-4 ${
                    isCurrent
                      ? "border-amber-400 bg-amber-50/40"
                      : "border-line bg-surface"
                  }`}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-base font-extrabold text-navy-900">
                        {plan.name}
                      </Text>
                      {isCurrent ? (
                        <Badge tone="warning">Current plan</Badge>
                      ) : null}
                    </View>
                    <Text className="text-lg font-extrabold text-navy-900">
                      ₹{priceInRupees.toLocaleString("en-IN")}
                    </Text>
                  </View>

                  <Text className="mt-1 text-xs text-text-muted">
                    {plan.max_active_listings} active job {plan.max_active_listings === 1 ? "opening" : "openings"} · {plan.duration_days} days validity
                  </Text>

                  {/* Capabilities List */}
                  {capabilities.length > 0 ? (
                    <View className="mt-3 gap-1.5 border-t border-line/60 pt-2.5">
                      {capabilities.map((cap, idx) => (
                        <View key={idx} className="flex-row items-center gap-2">
                          <Check size={14} color="#16a34a" />
                          <Text className="text-xs text-text-secondary">{cap}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {/* Action button */}
                  {!isCurrent ? (
                    <Button
                      variant="primary"
                      size="sm"
                      className="mt-3 w-full"
                      loading={isPending && selectedPlanId === plan.id}
                      onPress={() => {
                        setSelectedPlanId(plan.id);
                        void onSubscribe(plan.id);
                      }}
                    >
                      {priceInRupees === 0 ? "Select Free Plan" : `Upgrade to ${plan.name}`}
                    </Button>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
