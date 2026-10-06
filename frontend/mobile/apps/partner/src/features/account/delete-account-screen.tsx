// Ported from frontend/apps/customer/features/account/view/privacy-requests.tsx (erasure only)
import { describeError } from "@vsolve/query/native";
import { Badge, Button, ConfirmAction, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { isRequestOpen, useCreatePrivacyRequest, usePrivacyRequests, type PrivacyRequest } from "./privacy-queries";

const ERASURE_DESCRIPTION =
  "We remove what we are not required to keep. Records tax and consumer law require us to hold, such as invoices for completed work, stay until they expire.";

const STATUS_LABEL: Record<PrivacyRequest["status"], string> = {
  RECEIVED: "Received",
  IN_REVIEW: "In review",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
};

const STATUS_MEANING: Record<PrivacyRequest["status"], string> = {
  RECEIVED: "We have your request and will start on it.",
  IN_REVIEW: "Someone is working through it now.",
  COMPLETED: "Finished. Check your messages for what we sent.",
  REJECTED: "We could not act on this one. Contact support and we will explain why.",
};

export function DeleteAccountScreen() {
  const requestsQuery = usePrivacyRequests();
  const createRequest = useCreatePrivacyRequest();
  const [confirming, setConfirming] = useState(false);
  const requests = (requestsQuery.data ?? []).filter((item) => item.kind === "ERASURE");
  const open = requests.find(isRequestOpen) ?? null;

  if (requestsQuery.isPending) return <Skeleton className="m-4 h-40 rounded-card" />;
  if (requestsQuery.isError) {
    const described = describeError(requestsQuery.error, "read");
    return (
      <ErrorState
        title="We could not load your privacy requests"
        message={described.message}
        actionLabel="Try again"
        onAction={() => void requestsQuery.refetch()}
      />
    );
  }

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-4 px-4 py-5">
      <Text className="text-2xl font-bold text-text">Delete account</Text>
      <Text className="text-sm leading-6 text-text-secondary">{ERASURE_DESCRIPTION}</Text>
      <Button variant="outline" disabled={Boolean(open)} onPress={() => setConfirming(true)}>
        Delete my data
      </Button>
      {open ? (
        <Text className="text-xs text-text-muted">
          Already asked for on {new Date(open.requested_at).toLocaleDateString("en-IN")}. We will come back to you.
        </Text>
      ) : null}
      <Text className="mt-2 text-sm font-semibold text-text">Requests you have made</Text>
      {requests.length === 0 ? (
        <Text className="text-sm text-text-secondary">
          You have not asked for anything yet. Requests you make will be listed here with their progress.
        </Text>
      ) : (
        requests.map((item) => <RequestRow key={item.id} privacyRequest={item} />)
      )}
      <ConfirmAction
        open={confirming}
        onOpenChange={(next) => {
          if (!createRequest.isPending) setConfirming(next);
        }}
        title="Delete my data"
        consequence="We will start removing what we are not required to keep. You cannot cancel this from here. Bookings that are still going ahead are not cancelled by this. Cancel those first if that is what you want."
        confirmLabel="Request deletion"
        destructive
        pending={createRequest.isPending}
        onConfirm={() => {
          createRequest.mutate("ERASURE", {
            onSuccess: () => setConfirming(false),
          });
        }}
      />
      {createRequest.isError ? (
        <Text className="text-sm font-medium text-danger-text">
          {describeError(createRequest.error, "mutation").message}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function RequestRow({ privacyRequest }: { privacyRequest: PrivacyRequest }) {
  return (
    <View className="gap-1 border-b border-line py-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-text">Delete my data</Text>
        <Badge>{STATUS_LABEL[privacyRequest.status]}</Badge>
      </View>
      <Text className="text-sm text-text-secondary">{STATUS_MEANING[privacyRequest.status]}</Text>
    </View>
  );
}
