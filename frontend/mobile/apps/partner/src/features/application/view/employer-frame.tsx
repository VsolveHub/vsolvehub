// Ported from frontend/apps/partner/features/application/view/employer-frame.tsx
import { useQuery } from "@tanstack/react-query";
import { request, type Schemas } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { Text, useT } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { View } from "react-native";

import { useApplyDock } from "../model/dock-context";
import { previousStep } from "../model/progress";
import { nextStep } from "../model/steps";
import { isVersionConflict } from "../queries";
import { StepFrame } from "./application-editor";

type Application = Schemas["PartnerApplication"];

/**
 * The name given at sign-up, offered as the starting value so nobody types it twice. Never
 * overwrites what the applicant has already typed or saved.
 */
export function useSignUpName(): string {
  const profile = useQuery({
    queryKey: ["auth", "profile"],
    queryFn: () => request(() => getApiClient().GET("/api/v1/auth/profile/")),
    staleTime: 5 * 60 * 1000,
  });
  return (profile.data?.full_name ?? "").trim();
}

/** Where Back and Continue lead from the screen being shown, for this employer. */
export function useEmployerNav(application: Application) {
  const router = useRouter();
  const pathname = usePathname();
  const hiringAs = application.employer?.hiring_as;
  const back = previousStep(pathname, application.track, hiringAs);
  const next = nextStep(pathname, application.track, hiringAs);
  return {
    back,
    next,
    goNext: () => router.push((next?.href ?? "/apply") as never),
  };
}

/** A titled group of fields. One look for every employer screen: a quiet heading, then the fields. */
export function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={{ rowGap: 16 }}>
      <View style={{ rowGap: 2 }}>
        <Text className="text-sm font-semibold text-text">{title}</Text>
        {hint ? <Text className="text-xs leading-5 text-text-muted">{hint}</Text> : null}
      </View>
      <View style={{ rowGap: 16 }}>{children}</View>
    </View>
  );
}

/**
 * What every employer screen sits in: the title, the form, and the Continue bar at the bottom of
 * the apply screen (Back, Continue, and the error from the last save).
 *
 * Continue stays disabled until the screen says it can go on. On an application that can no longer
 * be edited the fields are locked and Continue only moves on, so a sent application can still be
 * read screen by screen.
 */
export function EmployerFrame({
  application,
  title,
  description,
  canContinue,
  saving,
  error,
  onContinue,
  children,
}: {
  application: Application;
  title: string;
  description?: string;
  canContinue: boolean;
  saving: boolean;
  error: unknown;
  onContinue: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const { registerDock } = useApplyDock();
  const { back, next } = useEmployerNav(application);
  const editable = application.can_edit;

  const conflict = Boolean(error) && isVersionConflict(error);
  const failureMessage = error && !conflict ? describeError(error, "mutation").message : null;

  const commitRef = useRef(onContinue);
  commitRef.current = onContinue;
  const stableOnCommit = useCallback(() => commitRef.current(), []);

  const backHref = back?.href ?? "/apply";
  const nextName = next?.label ?? null;

  useEffect(() => {
    // A sent application has no form to save: the layout's own Continue moves on.
    if (!editable) {
      registerDock(null);
      return;
    }
    registerDock({
      label: t("apply.editor.saveAndContinue"),
      backHref,
      nextStepName: nextName,
      onCommit: stableOnCommit,
      isSaving: saving,
      proceedDisabled: !canContinue,
      saved: false,
      conflict,
      refusal: failureMessage
        ? { title: t("apply.editor.saveFailed.title"), message: failureMessage }
        : null,
      failed: false,
      requestId: null,
      fieldMessages: [],
    });
  }, [editable, t, backHref, nextName, stableOnCommit, saving, canContinue, conflict, failureMessage, registerDock]);

  useEffect(() => () => registerDock(null), [registerDock]);

  return (
    <StepFrame title={title} description={description}>
      {editable ? null : (
        <View accessibilityRole="alert" className="mb-4 rounded-card border border-info-line bg-info-surface p-4">
          <Text className="text-sm text-info-text">{t("apply.editor.readOnlyNotice")}</Text>
        </View>
      )}
      <View
        pointerEvents={editable && !saving ? "auto" : "none"}
        style={{ rowGap: 28, opacity: editable ? 1 : 0.7 }}
      >
        {children}
      </View>
    </StepFrame>
  );
}
