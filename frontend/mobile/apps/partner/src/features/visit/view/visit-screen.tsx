// Ported from frontend/apps/partner/features/visit/view/visit-screen.tsx
import { describeError } from "@vsolve/query/native";
import { Button, ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { View } from "react-native";

import { planVisitOf, readEnquiryRecord } from "@/features/enquiry/model/wire";
import { isEnquiryForbidden, usePartnerEnquiry } from "@/features/enquiry/queries";
import { describeVisitStatus, visitPermissionsFor } from "@/features/visit/model/visit-state";
import { useCompleteVisit, useReportCustomerNoShow } from "@/features/visit/queries";

export function VisitScreen({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const enquiry = usePartnerEnquiry(invitationId);
  const complete = useCompleteVisit(invitationId);
  const noShow = useReportCustomerNoShow(invitationId);
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
        message="Check your connection and try again."
        actionLabel={forbidden ? undefined : "Try again"}
        onAction={forbidden ? undefined : () => void enquiry.refetch()}
      />
    );
  }
  const record = readEnquiryRecord(enquiry.data);
  const visit = planVisitOf(record.siteVisits);
  const permissions = visitPermissionsFor(visit);
  const copy = visit ? describeVisitStatus(visit.status) : null;

  return (
    <View className="flex-1 gap-3 bg-canvas px-4 py-6">
      <Text className="text-2xl font-extrabold text-text">{copy?.label ?? "No visit yet"}</Text>
      {copy ? <Text className="text-sm text-text-secondary">{copy.meaning}</Text> : null}
      {complete.error ? <Text className="text-sm text-danger-text">{describeError(complete.error, "mutation").message}</Text> : null}
      {permissions.canComplete && visit ? (
        <Button
          loading={complete.isPending}
          loadingLabel="Finishing"
          onPress={() => complete.mutate({ siteVisitId: visit.id })}
        >
          Finish the visit
        </Button>
      ) : null}
      {permissions.canReportCustomerNoShow && visit ? (
        <Button
          variant="ghost"
          loading={noShow.isPending}
          onPress={() => noShow.mutate({ siteVisitId: visit.id })}
        >
          Customer was not there
        </Button>
      ) : null}
      {permissions.canEstimate ? (
        <Button onPress={() => router.push(`/work/enquiries/${invitationId}/estimate` as never)}>Write the estimate</Button>
      ) : null}
      <Button variant="ghost" onPress={() => router.replace(`/work/enquiries/${invitationId}` as never)}>
        Back to the enquiry
      </Button>
    </View>
  );
}
