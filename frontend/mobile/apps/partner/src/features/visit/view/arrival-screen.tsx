// Ported from frontend/apps/partner/features/visit/view/arrival-screen.tsx
import { describeError } from "@vsolve/query/native";
import { Button, Card, ErrorState, Input, Spinner, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { planVisitOf, readEnquiryRecord } from "@/features/enquiry/model/wire";
import { isEnquiryForbidden, usePartnerEnquiry } from "@/features/enquiry/queries";
import { visitPermissionsFor } from "@/features/visit/model/visit-state";
import { useConfirmVisitArrivalWithCode } from "@/features/visit/queries";

export function ArrivalScreen({ invitationId }: { invitationId: string }) {
  const enquiry = usePartnerEnquiry(invitationId);
  const back = `/work/enquiries/${invitationId}`;
  if (enquiry.isPending) {
    return (
      <View className="flex-1 flex-row items-center justify-center gap-2 bg-canvas">
        <Spinner size="sm" />
        <Text className="text-text-secondary">Loading this visit…</Text>
      </View>
    );
  }
  if (enquiry.isError || enquiry.data === undefined) {
    const forbidden = isEnquiryForbidden(enquiry.error);
    return (
      <ErrorState
        title={forbidden ? "This visit is not yours" : "We could not load this visit"}
        message={forbidden ? "Vsolve has no visit with this reference on your account." : "Check your connection and try again."}
        actionLabel={forbidden ? undefined : "Try again"}
        onAction={forbidden ? undefined : () => void enquiry.refetch()}
      />
    );
  }
  return <ArrivalEntry invitationId={invitationId} back={back} detail={enquiry.data} />;
}

function ArrivalEntry({
  invitationId,
  back,
  detail,
}: {
  invitationId: string;
  back: string;
  detail: NonNullable<ReturnType<typeof usePartnerEnquiry>["data"]>;
}) {
  const router = useRouter();
  const record = readEnquiryRecord(detail);
  const visit = planVisitOf(record.siteVisits);
  const permissions = visitPermissionsFor(visit);
  const arrival = useConfirmVisitArrivalWithCode(invitationId);
  const [code, setCode] = useState("");

  if (visit === null || !permissions.canConfirmArrival) {
    return (
      <ErrorState
        title="This visit is not waiting on an arrival code"
        message={visit === null ? "There is no booked visit on this enquiry." : "It has either already started, or it is not one Vsolve can start yet."}
        actionLabel="Back to the enquiry"
        onAction={() => router.replace(back as never)}
      />
    );
  }

  return (
    <View className="flex-1 gap-4 bg-canvas px-4 py-6">
      <Card className="gap-4 p-5">
        <Text className="text-xl font-extrabold text-text">
          Ask {record.customerName ?? "the customer"} for their arrival code
        </Text>
        <Text className="text-sm text-text-secondary">They can read it from their Vsolve app. Entering it starts the visit.</Text>
        <Input value={code} onChangeText={setCode} maxLength={6} keyboardType="number-pad" placeholder="000000" />
        {arrival.error ? <Text className="text-sm text-danger-text">{describeError(arrival.error, "mutation").message}</Text> : null}
        <Button
          disabled={code.trim().length < 4}
          loading={arrival.isPending}
          loadingLabel="Starting the visit"
          onPress={() =>
            arrival.mutate(
              { siteVisitId: visit.id, code: code.trim() },
              { onSuccess: () => router.replace(back as never) },
            )
          }
        >
          Start the visit
        </Button>
      </Card>
      <Button variant="ghost" onPress={() => router.push(back as never)}>
        Not there yet
      </Button>
    </View>
  );
}
