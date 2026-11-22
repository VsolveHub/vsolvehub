// Ported from frontend/apps/partner/features/application/view/application-editor.tsx
import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { ErrorState, Skeleton, Text, useT } from "@vsolve/mobile-ui";
import { usePathname, useRouter } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform, StyleSheet, View } from "react-native";

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
import { useApplicationReference } from "../reference-queries";
import {
  describeRefusal,
  isVersionConflict,
  useCurrentVersion,
  usePartnerApplication,
  useUpdateApplication,
} from "../queries";

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
  title?: string;
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
  const t = useT();
  const reference = useApplicationReference();
  const referenceRefetch = reference.refetch;
  const [removedAreaNames, setRemovedAreaNames] = useState<readonly string[]>([]);
  const router = useRouter();
  const pathname = usePathname();
  const { registerDock } = useApplyDock();

  const following = continueOnSave ? nextStep(pathname, application?.track) : null;
  const isReadOnly = application !== null && !isEditable(application);
  const dirty = isDirty(draft, application);
  const currentVersion = useCurrentVersion();
  const refusal = describeRefusal(save.error, t, removedAreaNames);

  // Case G: a ticked area stopped taking partners before the save. Drop only that area, name it,
  // and refresh the list so it is not offered again. The other areas are kept.
  useEffect(() => {
    if (
      save.error instanceof ApiRequestError &&
      save.error.code === "partner_service_areas_unavailable"
    ) {
      const details = save.error.details as { unavailable_service_area_ids?: string[] } | undefined;
      const unavailable = details?.unavailable_service_area_ids;
      if (Array.isArray(unavailable) && unavailable.length > 0) {
        setRemovedAreaNames(
          reference.serviceAreas.filter((area) => unavailable.includes(area.id)).map((area) => area.name),
        );
        setDraft((current) => ({
          ...current,
          serviceAreaIds: current.serviceAreaIds.filter((id) => !unavailable.includes(id)),
        }));
        referenceRefetch();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.error]);

  const fieldErrors =
    save.error instanceof ApiRequestError && refusal === null ? save.error.fieldErrors : {};
  const fieldMessagesStr = Object.entries(fieldErrors)
    .flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`))
    .join("::");
  const fieldMessages = useMemo(
    () => (fieldMessagesStr ? fieldMessagesStr.split("::") : []),
    [fieldMessagesStr],
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

  const commitRef = useRef(commit);
  commitRef.current = commit;
  const stableOnCommit = useCallback(() => {
    commitRef.current();
  }, []);

  const previous = previousStep(pathname, application?.track);
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
      onCommit: stableOnCommit,
      isSaving,
      proceedDisabled: isProceedBlocked,
      saved: isSaved,
      conflict: isConflict,
      refusal,
      failed: isFailed,
      requestId,
      fieldMessages,
    });
  }, [
    isReadOnly,
    primaryLabel,
    backHref,
    nextStepName,
    stableOnCommit,
    isSaving,
    isProceedBlocked,
    isSaved,
    isConflict,
    refusal?.title,
    refusal?.message,
    isFailed,
    requestId,
    fieldMessagesStr,
    registerDock,
  ]);

  useEffect(() => {
    return () => {
      registerDock(null);
    };
  }, [registerDock]);

  const activeTitle = title ?? (pathname === "/apply/about" ? "Personal Information" : undefined);
  const activeDescription = description ?? (pathname === "/apply/about" ? "Enter your basic profile details for your partner account." : undefined);

  return (
    <View style={{ flexDirection: "column", width: "100%" }}>
      <ProceedDisabledSetterContext.Provider value={setChildProceedDisabled}>
        <EditorContext.Provider value={editor}>
          {activeTitle ? (
            <StepFrame title={activeTitle} description={activeDescription}>
              {children}
            </StepFrame>
          ) : (
            children
          )}
        </EditorContext.Provider>
      </ProceedDisabledSetterContext.Provider>
    </View>
  );
}

export function StepFrame({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <View style={stepFrameStyles.card}>
      <View style={stepFrameStyles.header}>
        <Text style={stepFrameStyles.title}>{title}</Text>
        {description ? <Text style={stepFrameStyles.description}>{description}</Text> : null}
      </View>
      <View style={stepFrameStyles.divider} />
      {children}
    </View>
  );
}

const stepFrameStyles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e7e2da",
    padding: 20,
    width: "100%",
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
        } as any)
      : {
          elevation: 1,
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 3,
        }),
  },
  header: {
    flexDirection: "column",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#00112e",
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 14,
    color: "#453f37",
    marginTop: 4,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: "#f1f5f9",
    marginTop: 16,
    marginBottom: 20,
  },
});
