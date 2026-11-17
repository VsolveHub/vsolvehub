import { Redirect } from "expo-router";

import { isWaitingForDecision } from "@/features/application/model/status";
import { usePartnerApplication } from "@/features/application/queries";
import { ApplicationStatusScreen } from "@/features/application/view/application-status-screen";

/**
 * An application that is waiting for a decision is shown on `/apply`, as on the website, which
 * has no separate status page. The status screen stays for the states that need an answer (a
 * declined or rejected application and its appeal). Every way in lands on the same view: the
 * profile menu, a push notification, a back gesture.
 */
export default function StatusRoute() {
  const application = usePartnerApplication();
  if (isWaitingForDecision(application.data?.status)) return <Redirect href="/apply" />;
  return <ApplicationStatusScreen />;
}
