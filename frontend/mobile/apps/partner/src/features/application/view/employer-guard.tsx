// Ported from frontend/apps/partner/features/application/view/employer-guard.tsx
import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { ErrorState, Spinner, Text, useT } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useEffect, type ReactNode } from "react";
import { View } from "react-native";

import { hiringAsOf } from "../model/employer";
import { usePartnerApplication } from "../queries";

type Application = Schemas["PartnerApplication"];

/** The screens an employer is walked through, and the old "About you" they must no longer see. */
export type EmployerScreen = "hiring-as" | "about" | "business" | "contact";

/**
 * Where this applicant belongs when they are on `screen`, or null when they belong here.
 *
 * Only an employer sees these screens, and only the ones for the type they chose: before choosing,
 * the choice; after, the individual's screen or the business's two, never the other's.
 */
function redirectFor(application: Application, screen: EmployerScreen): string | null {
  if (application.track !== "EMPLOYER") return "/apply";
  const hiringAs = hiringAsOf(application.employer);
  if (screen === "hiring-as") return null;
  if (hiringAs === "") return "/apply/hiring-as";
  if (screen === "about" && hiringAs === "BUSINESS") return "/apply/employer/business";
  if (screen !== "about" && hiringAs === "INDIVIDUAL") return "/apply/employer/about";
  return null;
}

/**
 * Loads the application and sends the applicant to the screen that fits them, then hands the
 * application to the screen. A redirect never throws away typing: the screen is only mounted once
 * the application has answered, and only for the type it belongs to.
 */
export function EmployerGuard({
  screen,
  children,
}: {
  screen: EmployerScreen;
  children: (application: Application) => ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const query = usePartnerApplication();
  const missing = query.error instanceof ApiRequestError && query.error.status === 404;
  const application = query.data ?? null;
  const destination = application ? redirectFor(application, screen) : missing ? "/apply" : null;

  useEffect(() => {
    if (destination) router.replace(destination as never);
  }, [destination, router]);

  if (query.isError && !missing) {
    return (
      <ErrorState
        title={t("apply.editor.loadError.title")}
        message={t("apply.editor.loadError.message")}
        actionLabel={t("common.tryAgain")}
        onAction={() => void query.refetch()}
      />
    );
  }

  // Only the first answer is waited for: a later refetch must not unmount a form being typed in.
  const hasAnswered = query.dataUpdatedAt > 0 || query.errorUpdatedAt > 0;
  if (!application || destination || (query.isPending && !hasAnswered)) {
    return (
      <View accessibilityRole="progressbar" className="flex-row items-center gap-2 py-8">
        <Spinner size="sm" />
        <Text className="text-sm text-text-secondary">{t("apply.common.continuingApplication")}</Text>
      </View>
    );
  }

  return children(application);
}

/**
 * The old "About you" asked an employer for a biography and years of experience, neither of which
 * an employer is asked for. An employer who lands on it goes to the choice of who is hiring.
 */
export function EmployerAboutRedirect({ children }: { children: ReactNode }) {
  const router = useRouter();
  const query = usePartnerApplication();
  const isEmployer = query.data?.track === "EMPLOYER";

  useEffect(() => {
    if (isEmployer) router.replace("/apply/hiring-as" as never);
  }, [isEmployer, router]);

  if (isEmployer) return null;
  return children;
}
