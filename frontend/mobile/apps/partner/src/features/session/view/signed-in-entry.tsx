import { ApiRequestError } from "@vsolve/api-client";
import { Spinner } from "@vsolve/mobile-ui";
import { Redirect } from "expo-router";
import { View } from "react-native";

import { usePartnerApplication } from "@/features/application/queries";
import { shellForApplication } from "@/features/session/model/redirect";

/**
 * Where the app opens for someone who is already signed in (a reload, a cold start).
 *
 * It waits for the application's status so a Partner who is not approved opens in the onboarding
 * shell, the same one they get by tapping through its steps, instead of the workspace shell.
 * If the status cannot be read, `/home` takes over: it has its own "could not load" state and
 * the guard around it decides who may stay.
 */
export function SignedInEntry() {
  const application = usePartnerApplication();
  const missing = application.error instanceof ApiRequestError && application.error.status === 404;

  if (application.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Spinner />
      </View>
    );
  }
  if (application.isError && !missing) return <Redirect href="/home" />;
  return <Redirect href={shellForApplication(missing ? null : (application.data?.status ?? null))} />;
}
