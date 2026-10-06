// Ported from frontend/apps/partner/features/application/view/application-editor.tsx
import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { Button, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { usePathname, useRouter } from "expo-router";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";

import {
  changedFields,
  draftFromApplication,
  isDirty,
  type ApplicationDraft,
} from "../model/draft";
import { previousStep } from "../model/progress";
import { isEditable } from "../model/readiness";
import { nextStep } from "../model/steps";
import { isVersionConflict, usePartnerApplication, useUpdateApplication } from "../queries";

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
      <View accessibilityLabel="Loading your application" className="flex-col gap-4">
        <View className="flex-col gap-2">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </View>
        <View className="mt-2 flex-col gap-3">
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

  const following = continueOnSave ? nextStep(pathname) : null;
  const isReadOnly = application !== null && !isEditable(application);
  const dirty = isDirty(draft, application);

  const fieldErrors = save.error instanceof ApiRequestError ? save.error.fieldErrors : {};
  const fieldMessages = Object.entries(fieldErrors).flatMap(([field, messages]) =>
    messages.map((message) => `${field}: ${message}`),
  );

  function update(patch: Partial<ApplicationDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    save.reset();
  }

  const editor: ApplicationEditorRenderProps = {
    draft,
    update,
    application,
    isReadOnly,
    setProceedDisabled: setChildProceedDisabled,
  };

  const nextStepName = following ? following.label : null;
  const primaryLabel = saveLabel ?? "Save and Continue";

  function commit() {
    if (!dirty) {
      if (following !== null) router.push(following.href as never);
      return;
    }

    save.mutate(changedFields(draft, application), {
      onSuccess: () => {
        if (following !== null) router.push(following.href as never);
      },
    });
  }

  const previous = previousStep(pathname);
  const backHref = previous ? previous.href : "/apply";

  return (
    <View className="flex-col gap-5">
      <View className="flex-col gap-5 rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <View className="flex-col gap-1 border-b border-line pb-4">
          <Text accessibilityRole="header" className="text-xl font-extrabold tracking-tight text-navy-900">
            {title}
          </Text>
          {description ? (
            <Text className="text-xs leading-relaxed text-text-secondary">{description}</Text>
          ) : null}
        </View>

        {isReadOnly ? (
          <Text
            accessibilityLiveRegion="polite"
            className="rounded-card border border-info-line bg-info-surface p-4 text-[0.9375rem] leading-relaxed text-info-text"
          >
            Your application is with a reviewer, so it cannot be changed right now. If something needs
            correcting, we will tell you what and reopen it.
          </Text>
        ) : null}

        <ProceedDisabledSetterContext.Provider value={setChildProceedDisabled}>
          <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>
        </ProceedDisabledSetterContext.Provider>
      </View>

      {isReadOnly ? null : (
        <EditorDock
          label={primaryLabel}
          backHref={backHref}
          nextStepName={nextStepName}
          onCommit={commit}
          isSaving={save.isPending}
          proceedDisabled={proceedDisabled || childProceedDisabled}
          saved={save.isSuccess && !dirty}
          conflict={isVersionConflict(save.error)}
          failed={save.isError && !isVersionConflict(save.error) && fieldMessages.length === 0}
          requestId={save.error instanceof ApiRequestError ? save.error.requestId : null}
          fieldMessages={fieldMessages}
        />
      )}
    </View>
  );
}

function EditorDock({
  label,
  backHref,
  nextStepName,
  onCommit,
  isSaving,
  proceedDisabled,
  saved,
  conflict,
  failed,
  requestId,
  fieldMessages,
}: {
  label: string;
  backHref: string;
  nextStepName: string | null;
  onCommit: () => void;
  isSaving: boolean;
  proceedDisabled: boolean;
  saved: boolean;
  conflict: boolean;
  failed: boolean;
  requestId: string | null;
  fieldMessages: readonly string[];
}) {
  const router = useRouter();

  return (
    <View className="shrink-0 border-t border-line bg-surface shadow-lg">
      <View className="w-full flex-col gap-2 px-4 py-3">
        {conflict ? (
          <ErrorState
            inline
            severity="warning"
            title="Someone else changed this application"
            message="We have reloaded the latest version so you can see it before saving again. Your last change was not applied."
          />
        ) : null}

        {failed ? (
          <ErrorState
            inline
            title="We could not save this"
            message="Nothing was changed. Check your connection and try again."
            reference={requestId}
          />
        ) : null}

        {fieldMessages.length > 0 ? (
          <View accessibilityRole="alert" className="flex-col gap-1">
            {fieldMessages.map((message) => (
              <Text key={message} className="text-[0.8125rem] font-semibold text-danger-text">
                {message}
              </Text>
            ))}
          </View>
        ) : null}

        {saved && !conflict && !failed ? (
          <Text accessibilityLiveRegion="polite" className="text-center text-[0.8125rem] font-bold text-success-text">
            ✓ Changes saved securely.
          </Text>
        ) : null}

        <View className="flex-row items-center gap-2.5">
          <Button variant="outline" size="lg" className="h-12 px-5" onPress={() => router.push(backHref as never)}>
            Back
          </Button>
          <Button
            size="lg"
            block
            loading={isSaving}
            loadingLabel="Saving..."
            disabled={proceedDisabled}
            onPress={onCommit}
            className="h-12 flex-1 shadow-md"
          >
            {label}
          </Button>
        </View>

        {nextStepName ? (
          <Text className="text-center text-[11px] font-semibold text-text-muted">
            Auto-saves as you type • Tap to proceed to {nextStepName}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
