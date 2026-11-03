// Ported from frontend/apps/partner/features/application/view/application-editor.tsx
import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { usePathname, useRouter } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Platform, useWindowDimensions, View } from "react-native";

import { useApplyDock } from "../model/dock-context";
import {
  changedFields,
  draftFromApplication,
  isDirty,
  type ApplicationDraft,
} from "../model/draft";
import { previousStep } from "../model/progress";
import { isEditable } from "../model/readiness";
import { nextStep } from "../model/steps";
import { describeRefusal, isVersionConflict, useCurrentVersion, usePartnerApplication, useUpdateApplication } from "../queries";

type Application = Schemas["PartnerApplication"];

export interface ApplicationEditorRenderProps {
  draft: ApplicationDraft;
  update: (patch: Partial<ApplicationDraft>) => void;
  application: Application | null;
  isReadOnly: boolean;
  setProceedDisabled: (disabled: boolean) => void;
}

const EditorContext = createContext<ApplicationEditorRenderProps | null>(null);

export function useApplicationEditor(): ApplicationEditorRenderProps {
  const value = useContext(EditorContext);
  if (value === null) {
    throw new Error("useApplicationEditor must be used inside <ApplicationEditor>");
  }
  return value;
}

const ProceedDisabledSetterContext = createContext<((disabled: boolean) => void) | null>(null);

/** Register step-local validation that blocks Continue until resolved. */
export function useProceedDisabled(disabled: boolean): void {
  const setProceedDisabled = useContext(ProceedDisabledSetterContext);
  useEffect(() => {
    setProceedDisabled?.(disabled);
    return () => setProceedDisabled?.(false);
  }, [disabled, setProceedDisabled]);
}

export interface ApplicationEditorProps {
  title: string;
  description?: string;
  children: ReactNode;
  saveLabel?: string;
  continueOnSave?: boolean;
  proceedDisabled?: boolean;
}

export function ApplicationEditor(props: ApplicationEditorProps) {
  const query = usePartnerApplication();
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <View accessibilityLabel="Loading your application" style={{ flexDirection: "column", rowGap: 16 }}>
        <View style={{ flexDirection: "column", rowGap: 8 }}>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </View>
        <View style={{ marginTop: 8, flexDirection: "column", rowGap: 12 }}>
          <Skeleton className="h-12 w-full rounded-control" />
          <Skeleton className="h-12 w-full rounded-control" />
          <Skeleton className="h-24 w-full rounded-control" />
        </View>
      </View>
    );
  }

  if (query.isError && !isMissing) {
    return (
      <ErrorState
        title="We could not load your application"
        message="Nothing you have saved is lost. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void query.refetch()}
      />
    );
  }

  const application = query.data ?? null;

  return <Editor key={application?.version ?? "new"} application={application} {...props} />;
}

function Editor({
  application,
  title,
  description,
  saveLabel,
  continueOnSave = true,
  proceedDisabled = false,
  children,
}: ApplicationEditorProps & { application: Application | null }) {
  const [draft, setDraft] = useState(() => draftFromApplication(application));
  const [childProceedDisabled, setChildProceedDisabled] = useState(false);
  const save = useUpdateApplication();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const { registerDock } = useApplyDock();

  const following = continueOnSave ? nextStep(pathname) : null;
  const isReadOnly = application !== null && !isEditable(application);
  const dirty = isDirty(draft, application);
  const currentVersion = useCurrentVersion();
  const refusal = describeRefusal(save.error);

  const fieldErrors =
    save.error instanceof ApiRequestError && refusal === null ? save.error.fieldErrors : {};
  const fieldMessages = Object.entries(fieldErrors).flatMap(([field, messages]) =>
    messages.map((message) => `${field}: ${message}`),
  );

  const update = useCallback((patch: Partial<ApplicationDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    save.reset();
  }, [save]);

  const editor: ApplicationEditorRenderProps = useMemo(
    () => ({
      draft,
      update,
      application,
      isReadOnly,
      setProceedDisabled: setChildProceedDisabled,
    }),
    [draft, update, application, isReadOnly],
  );

  const nextStepName = following ? following.label : null;
  const primaryLabel = saveLabel ?? "Save and Continue";

  const commit = useCallback(() => {
    if (save.isPending) return;
    if (!dirty) {
      if (following !== null) router.push(following.href as never);
      return;
    }

    const version = application?.version ?? currentVersion();
    save.mutate(
      {
        ...changedFields(draft, application),
        ...(version !== undefined ? { expected_version: version } : {}),
      },
      {
        onSuccess: () => {
          if (following !== null) router.push(following.href as never);
        },
      },
    );
  }, [dirty, following, router, save, draft, application, currentVersion]);

  const previous = previousStep(pathname);
  const backHref = previous ? previous.href : "/apply";

  const isSaving = save.isPending;
  const isConflict = isVersionConflict(save.error);
  const isFailed = save.isError && !isConflict && refusal === null && fieldMessages.length === 0;
  const requestId = save.error instanceof ApiRequestError ? save.error.requestId : null;
  const isSaved = save.isSuccess && !dirty;
  const isProceedBlocked = proceedDisabled || childProceedDisabled;

  // Register dock with fixed footer at root of ApplyLayout
  useEffect(() => {
    if (isReadOnly) {
      registerDock(null);
      return;
    }

    registerDock({
      label: primaryLabel,
      backHref,
      nextStepName,
      onCommit: commit,
      isSaving,
      proceedDisabled: isProceedBlocked,
      saved: isSaved,
      conflict: isConflict,
      refusal,
      failed: isFailed,
      requestId,
      fieldMessages,
    });

    return () => {
      registerDock(null);
    };
  }, [
    isReadOnly,
    primaryLabel,
    backHref,
    nextStepName,
    commit,
    isSaving,
    isProceedBlocked,
    isSaved,
    isConflict,
    refusal,
    isFailed,
    requestId,
    fieldMessages,
    registerDock,
  ]);

  return (
    <View style={{ flexDirection: "column", width: "100%" }}>
      {/* Main Form White Card Matching Web Exact UI */}
      <View
        style={{
          borderRadius: 24,
          borderWidth: 1,
          borderColor: "#e7e2da",
          backgroundColor: "#ffffff",
          padding: isDesktop ? 36 : 22,
          ...(Platform.OS === "web"
            ? ({
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
              } as any)
            : {
                elevation: 2,
                shadowColor: "#00112e",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 3,
              }),
        }}
      >
        {/* Header with Title and Description */}
        <View style={{ borderBottomWidth: 1, borderColor: "#f0ece4", paddingBottom: 18, marginBottom: 20 }}>
          <Text
            accessibilityRole="header"
            style={{
              fontSize: isDesktop ? 28 : 24,
              fontWeight: "800",
              letterSpacing: -0.5,
              color: "#00112e",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {title}
          </Text>
          {description ? (
            <Text
              style={{
                fontSize: 13,
                lineHeight: 20,
                color: "#524d45",
                marginTop: 4,
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
            >
              {description}
            </Text>
          ) : null}
        </View>

        {isReadOnly ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#bae6fd",
              backgroundColor: "#f0f9ff",
              padding: 16,
              fontSize: 14,
              lineHeight: 20,
              color: "#0369a1",
              marginBottom: 16,
            }}
          >
            Your application is with a reviewer, so it cannot be changed right now. If something needs
            correcting, we will tell you what and reopen it.
          </Text>
        ) : null}

        <ProceedDisabledSetterContext.Provider value={setChildProceedDisabled}>
          <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>
        </ProceedDisabledSetterContext.Provider>
      </View>
    </View>
  );
}
