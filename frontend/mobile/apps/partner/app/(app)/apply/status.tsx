import { ApiRequestError } from "@vsolve/api-client";
import { ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { Redirect } from "expo-router";
import { View } from "react-native";

import { usePartnerApplication } from "@/features/application/queries";
import { ApplicationStatusScreen } from "@/features/application/view/application-status-screen";

/** The decisions that need an answer — the appeal lives on the status screen. */
const NEEDS_STATUS_SCREEN = new Set(["DECLINED", "REJECTED"]);

/**
 * Every other application is shown on `/apply`, as on the website, which has no separate status
 * page. Every way in lands on the same view: the profile menu, a push notification, a back gesture.
 *
 * The status screen is drawn only once the server has said which decision it is. Drawing it
 * before (while loading, or after a failed load) showed a made-up "Application in review" with
 * no dates, and an in-review partner never reached the overview.
 */
export default function StatusRoute() {
  const application = usePartnerApplication();
  const missing = application.error instanceof ApiRequestError && application.error.status === 404;

  if (application.isPending) {
    return (
      <View className="items-center justify-center gap-3 py-16">
        <Spinner size="sm" />
        <Text className="text-sm text-text-secondary">Loading your application…</Text>
      </View>
    );
  }

  if (application.isError && !missing) {
    return (
      <ErrorState
        title="We could not load your application"
        message="Nothing you have saved is lost. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void application.refetch()}
      />
    );
  }

  if (missing || !NEEDS_STATUS_SCREEN.has(application.data?.status ?? "")) return <Redirect href="/apply" />;
  return <ApplicationStatusScreen />;
}
