// Ported from frontend/apps/partner/features/offers/view/offers-gate.tsx
import { Spinner, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import { usePartnerApplication } from "@/features/application/queries";
import { ApprovalRequired } from "@/features/application/view/approval-required";

import { OfferInbox } from "./offer-inbox";

export function OffersGate() {
  const application = usePartnerApplication();
  const isApproved = application.data?.status === "APPROVED";

  return (
    <View className="flex-1 bg-canvas px-4 py-6">
      <Text className="text-2xl font-bold text-text">Your offers</Text>
      <Text className="mt-1.5 text-sm leading-6 text-text-secondary">
        Each offer is one visit. Accepting gives you two minutes to change your mind.
      </Text>
      <View className="mt-5 flex-1">
        {application.isPending ? (
          <View className="flex-row items-center gap-2">
            <Spinner size="sm" />
            <Text className="text-text-secondary">Loading your account…</Text>
          </View>
        ) : isApproved ? (
          <OfferInbox />
        ) : (
          <ApprovalRequired detail="Offers start arriving once a reviewer has approved your application. This is not the same as there being no work — nothing is being offered to you yet." />
        )}
      </View>
    </View>
  );
}
