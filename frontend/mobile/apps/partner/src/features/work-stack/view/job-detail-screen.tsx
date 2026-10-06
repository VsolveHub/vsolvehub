// Ported from frontend/apps/partner/features/work-stack/view/job-detail-screen.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { describeError } from "@vsolve/query/native";
import { ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import { usePartnerEngagement } from "@/features/engagement/queries";
import { usePartnerVisit } from "@/features/work/queries";

import { BookingSupport } from "./booking-support";
import { EngagementJobView } from "./engagement-job-view";
import { Pictogram } from "./pictogram";
import { VisitJobView } from "./visit-job-view";

export function JobDetailScreen({ id }: { id: string }) {
  const engagement = usePartnerEngagement(id);
  const notAnEngagement = isNotFound(engagement.error);
  const visit = usePartnerVisit(notAnEngagement ? id : null);

  if (engagement.isPending || (notAnEngagement && visit.isPending)) {
    return (
      <View className="flex-1 flex-row items-center justify-center gap-2 bg-canvas py-16">
        <Spinner size="sm" />
        <Text className="text-text-secondary">Loading this job…</Text>
      </View>
    );
  }

  if (engagement.data !== undefined) {
    return (
      <View className="flex-1 bg-canvas">
        <EngagementJobView key={engagement.data.id} engagement={engagement.data} />
        <View className="bg-canvas px-4 pb-6">
          <BookingSupport reference={engagement.data.id} />
        </View>
      </View>
    );
  }

  if (!notAnEngagement) {
    return <ReadFailure error={engagement.error} onRetry={() => void engagement.refetch()} />;
  }

  if (visit.data !== undefined) {
    return (
      <View className="flex-1 bg-canvas">
        <VisitJobView key={visit.data.id} visit={visit.data} />
        <View className="bg-canvas px-4 pb-6">
          <BookingSupport reference={visit.data.id} />
        </View>
      </View>
    );
  }

  if (isNotYours(visit.error)) return <Gone />;

  return <ReadFailure error={visit.error} onRetry={() => void visit.refetch()} />;
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

function isNotYours(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 403 || error.status === 404);
}

function ReadFailure({ error, onRetry }: { readonly error: unknown; readonly onRetry: () => void }) {
  const presentation = describeError(error, "read");
  return (
    <View className="flex-1 bg-canvas px-4 py-6">
      <ErrorState
        title={presentation.title}
        message={presentation.message}
        severity={presentation.severity}
        actionLabel="Try again"
        onAction={onRetry}
        reference={presentation.reference}
      />
    </View>
  );
}

function Gone() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas py-16">
      <View className="h-42 w-42 items-center justify-center rounded-full bg-surface-sunken">
        <Pictogram name="stopped" size="xl" className="text-warm-400" />
      </View>
      <Text className="mt-5 max-w-[22ch] text-center text-base font-semibold text-text-secondary">
        No job with this reference on your account
      </Text>
    </View>
  );
}
