// Ported from frontend/apps/partner/features/application/view/application-editor.tsx
import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { ErrorState, Skeleton } from "@vsolve/mobile-ui";
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
import { View } from "react-native";

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
  const { registerDock } = useApplyDock();

  const following = continueOnSave ? nextStep(pathname) : null;
  const isReadOnly = application !== null && !isEditable(application);
  const dirty = isDirty(draft, application);
  const currentVersion = useCurrentVersion();
  const refusal = describeRefusal(save.error);

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
  const primaryLabel = saveLabel ?? "Continue";

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

  const previous = previousStep(pathname);
  const backHref = previous ? previous.href : "/apply/about";

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

    return () => {
      registerDock(null);
    };
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

  return (
    <View style={{ flexDirection: "column", width: "100%" }}>
      <ProceedDisabledSetterContext.Provider value={setChildProceedDisabled}>
        <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>
      </ProceedDisabledSetterContext.Provider>
    </View>
  );
}
