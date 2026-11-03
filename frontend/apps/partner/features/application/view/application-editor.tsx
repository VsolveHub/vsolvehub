"use client";

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { Button, buttonStyles, ErrorState, Skeleton, useT, type Translator } from "@vsolve/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  changedFields,
  draftFromApplication,
  isDirty,
  type ApplicationDraft,
} from "../model/draft";
import { previousStep } from "../model/progress";
import { isEditable } from "../model/readiness";
import { nextStep } from "../model/steps";
import { ApplyDock } from "./apply-shell";
import { isVersionConflict, usePartnerApplication, useUpdateApplication } from "../queries";

/**
 * The frame every editing step sits in.
 *
 * It owns the three things a Partner form must get right and a step should not
 * have to think about: whether the application is still theirs to edit, which
 * fields this step actually changed, and what happens when a reviewer changes
 * the application underneath them.
 *
 * Since contract 1.4.0 the update is genuinely partial, so a save sends only the
 * fields the step touched (`changedFields`). That is not an optimisation — two
 * people editing different steps must not overwrite each other, and sending the
 * whole record is exactly how they would.
 */

type Application = Schemas["PartnerApplication"];

export interface ApplicationEditorRenderProps {
  draft: ApplicationDraft;
  update: (patch: Partial<ApplicationDraft>) => void;
  application: Application | null;
  isReadOnly: boolean;
}

/**
 * The draft, handed to steps through context rather than as a render prop.
 *
 * This was `children: (props) => ReactNode`, and every step page is a **Server**
 * Component — so each one was passing a function across the server/client
 * boundary. Functions are not serialisable into the RSC payload, and React
 * refused the whole tree with *"Functions are not valid as a child of Client
 * Components"*. Every render-prop step page threw at runtime; only the pages
 * that happened not to use one still worked.
 *
 * Context fixes it without pushing `"use client"` up into the pages, which would
 * have been the other obvious move and would have cost them their `metadata`
 * export. A step is now an ordinary element the server can serialise, and the
 * data reaches it inside the client boundary where it was always meant to live.
 */
const EditorContext = createContext<ApplicationEditorRenderProps | null>(null);

export function useApplicationEditor(): ApplicationEditorRenderProps {
  const value = useContext(EditorContext);
  if (value === null) {
    throw new Error("useApplicationEditor must be used inside <ApplicationEditor>");
  }
  return value;
}

/**
 * A save Django refused for a reason the applicant can act on, in words.
 *
 * Its own copy rather than the envelope message: that one names catalogue
 * codes ("cctv-technician") the applicant has never seen.
 */
function describeRefusal(
  error: unknown,
  t: Translator["t"],
): { title: string; message: string } | null {
  if (!(error instanceof ApiRequestError) || error.status !== 409) return null;
  if (error.code === "partner_application_incomplete") {
    return {
      title: t("apply.editor.refusal.incomplete.title"),
      message: t("apply.editor.refusal.incomplete.message"),
    };
  }
  if (error.code === "partner_transition_not_allowed") {
    return {
      title: t("apply.editor.refusal.notAllowed.title"),
      message: t("apply.editor.refusal.notAllowed.message"),
    };
  }
  return null;
}

/**
 * Each section that can block Continue registers under its own id, so two sections on one step
 * (trades and service areas) cannot overwrite each other's answer.
 */
const ProceedBlockerContext = createContext<((id: string, blocked: boolean) => void) | null>(
  null,
);

/** Register step-local validation that blocks Continue until resolved. */
export function useProceedDisabled(disabled: boolean): void {
  const setBlocker = useContext(ProceedBlockerContext);
  const id = useId();
  useEffect(() => {
    setBlocker?.(id, disabled);
    return () => setBlocker?.(id, false);
  }, [disabled, id, setBlocker]);
}

/**
 * The frame every onboarding step sits in: one title, one line of description, the content.
 * Steps that do not edit the application draft (documents, review) use it directly.
 */
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
    <section className="flex flex-col gap-5 rounded-card border border-line bg-surface p-3.5 shadow-xs sm:p-6">
      <header className="flex flex-col gap-1 border-b border-line pb-4">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-text">{title}</h1>
        {description ? <p className="text-xs sm:text-sm text-text-secondary">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export interface ApplicationEditorProps {
  title: string;
  description?: string;
  /** The step's own element. Serialisable, so a Server Component may pass it. */
  children: ReactNode;
  /**
   * Blockers this step cannot resolve, named so the save button explains itself
   * instead of being mysteriously disabled.
   */
  saveLabel?: string;
  /**
   * Whether a successful save moves to the next step.
   *
   * Default `true`, because every label this component ships with says
   * "continue". Set it false only for a step that genuinely ends somewhere else,
   * and change the label to match — a button that says continue and does not is
   * the bug this option exists to make deliberate rather than accidental.
   */
  continueOnSave?: boolean;
  /** When true, the primary continue button stays disabled. */
  proceedDisabled?: boolean;
}

export function ApplicationEditor(props: ApplicationEditorProps) {
  const t = useT();
  const query = usePartnerApplication();

  // A 404 is "you have not started yet", which is a state, not a failure.
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;
  // A refetch of a 404 is `isPending` again (there is no data to keep), and
  // showing the skeleton then would unmount `Editor` and drop the draft.
  const hasAnswered = query.dataUpdatedAt > 0 || query.errorUpdatedAt > 0;

  if (query.isPending && !hasAnswered) {
    /*
      The shape of the step, not a spinner on an empty page.

      Onboarding runs on the same mid-range Android and patchy data as the rest
      of the app, and a centred spinner there is several seconds of blank screen
      that reads as a form which failed to load — on the one flow where an
      applicant has no reason yet to trust that it works.
    */
    return (
      <div role="status" aria-label={t("apply.editor.loadingAriaLabel")} className="flex flex-col gap-4">
        <div aria-hidden className="flex flex-col gap-2">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div aria-hidden className="mt-2 flex flex-col gap-3">
          <Skeleton className="h-12 w-full rounded-control" />
          <Skeleton className="h-12 w-full rounded-control" />
          <Skeleton className="h-24 w-full rounded-control" />
        </div>
      </div>
    );
  }

  if (query.isError && !isMissing) {
    return (
      <ErrorState
        title={t("apply.editor.loadError.title")}
        message={t("apply.editor.loadError.message")}
        actionLabel={t("common.tryAgain")}
        onAction={() => void query.refetch()}
      />
    );
  }

  const application = query.data ?? null;

  return (
    <Editor
      // Re-seeds the draft whenever the server's version moves — after a save,
      // and after a reviewer's change is picked up by a conflict refetch.
      key={application?.version ?? "new"}
      application={application}
      {...props}
    />
  );
}

function Editor({
  application,
  title,
  description,
  // Deliberately no default: an explicit `saveLabel` is a step saying the
  // generic verb is wrong for it, and a default would be indistinguishable
  // from that.
  saveLabel,
  continueOnSave = true,
  proceedDisabled = false,
  children,
}: ApplicationEditorProps & { application: Application | null }) {
  const t = useT();
  const [draft, setDraft] = useState(() => draftFromApplication(application));
  const [blockers, setBlockers] = useState<ReadonlySet<string>>(() => new Set());
  const setBlocker = useCallback((id: string, blocked: boolean) => {
    setBlockers((current) => {
      if (current.has(id) === blocked) return current;
      const next = new Set(current);
      if (blocked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const save = useUpdateApplication();
  const router = useRouter();
  const pathname = usePathname();

  // Resolved from the shared sequence rather than passed in per page, so the
  // navigation and this button cannot disagree about what comes next.
  const following = continueOnSave ? nextStep(pathname, application?.track) : null;

  const isReadOnly = application !== null && !isEditable(application);
  const dirty = isDirty(draft, application);

  // A domain refusal (incomplete, not allowed now) arrives with `details` of
  // `{message, code}`, which `fieldErrors` would print as two "fields":
  // "message: Select the required skills for: cctv-technician." and
  // "code: partner_application_incomplete". It is one sentence, not field errors.
  const refusal = describeRefusal(save.error, t);
  const fieldErrors =
    save.error instanceof ApiRequestError && refusal === null ? save.error.fieldErrors : {};
  const fieldMessages = Object.entries(fieldErrors).flatMap(([field, messages]) =>
    messages.map((message) => `${field}: ${message}`),
  );

  function update(patch: Partial<ApplicationDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    save.reset();
  }

  const editor = useMemo<ApplicationEditorRenderProps>(
    () => ({
      draft,
      update,
      application,
      isReadOnly,
    }),
    // `update` is stable enough in practice — it only closes over `setDraft` and
    // `save.reset` — and is recreated with the component anyway, which is keyed
    // on the application version above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, application, isReadOnly],
  );

  /*
    Continue always continues.

    The old button was `disabled={!dirty}`, which produced the single worst trap
    in this flow: revisit a step you already completed, change nothing, and the
    only forward control on the screen is dead. There is no error, no
    explanation, and no other way on — the applicant has to notice a "Back to
    your application" link and navigate the sequence by hand.

    Saving and continuing are two things and only one of them needs a change to
    act on. So a clean step navigates without spending a request, and a dirty one
    saves first and moves on success. The label says which is about to happen.
  */
  const primaryLabel = saveLabel ? t(saveLabel) : t("apply.editor.saveAndContinue");

  function commit() {
    if (!dirty) {
      if (following !== null) router.push(following.href);
      return;
    }

    save.mutate(changedFields(draft, application), {
      onSuccess: () => {
        if (following !== null) router.push(following.href);
      },
    });
  }

  const previous = previousStep(pathname, application?.track);
  const backHref = previous ? previous.href : "/apply";

  return (
    <>
      <StepFrame title={t(title)} description={description ? t(description) : undefined}>
        {isReadOnly ? (
          <p
            role="status"
            className="rounded-card border border-info-line bg-info-surface p-4 text-sm text-info-text"
          >
            {t("apply.editor.readOnlyNotice")}
          </p>
        ) : null}

        <ProceedBlockerContext.Provider value={setBlocker}>
          <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>
        </ProceedBlockerContext.Provider>
      </StepFrame>

      {isReadOnly ? null : (
        <EditorDock
          label={primaryLabel}
          backHref={backHref}
          onCommit={commit}
          isSaving={save.isPending}
          proceedDisabled={proceedDisabled || blockers.size > 0}
          saved={save.isSuccess && !dirty}
          conflict={isVersionConflict(save.error)}
          refusal={refusal}
          failed={
            save.isError &&
            !isVersionConflict(save.error) &&
            refusal === null &&
            fieldMessages.length === 0
          }
          requestId={save.error instanceof ApiRequestError ? save.error.requestId : null}
          fieldMessages={fieldMessages}
        />
      )}
    </>
  );
}

function EditorDock({
  label,
  backHref,
  onCommit,
  isSaving,
  proceedDisabled,
  saved,
  conflict,
  refusal,
  failed,
  requestId,
  fieldMessages,
}: {
  label: string;
  backHref: string;
  onCommit: () => void;
  isSaving: boolean;
  proceedDisabled: boolean;
  saved: boolean;
  conflict: boolean;
  refusal: { title: string; message: string } | null;
  failed: boolean;
  requestId: string | null;
  fieldMessages: readonly string[];
}) {
  const t = useT();

  return (
    <ApplyDock>
        {conflict ? (
          <ErrorState
            inline
            severity="warning"
            title={t("apply.editor.conflict.title")}
            message={t("apply.editor.conflict.message")}
          />
        ) : null}

        {refusal ? (
          <ErrorState
            inline
            severity="warning"
            title={refusal.title}
            message={refusal.message}
            reference={requestId}
          />
        ) : null}

        {failed ? (
          <ErrorState
            inline
            title={t("apply.editor.saveFailed.title")}
            message={t("apply.editor.saveFailed.message")}
            reference={requestId}
          />
        ) : null}

        {fieldMessages.length > 0 ? (
          <ul role="alert" className="flex list-none flex-col gap-1 p-0">
            {fieldMessages.map((message) => (
              <li key={message} className="text-[0.8125rem] font-semibold text-danger-text">
                {message}
              </li>
            ))}
          </ul>
        ) : null}

        {saved && !conflict && !failed && refusal === null ? (
          <p role="status" className="text-[0.8125rem] font-bold text-success-text text-center">
            {t("apply.editor.saved")}
          </p>
        ) : null}

        <div className="flex items-center gap-2 sm:gap-2.5">
          <Link
            href={backHref}
            className={buttonStyles({
              variant: "outline",
              size: "lg",
              className: "justify-center shrink-0 font-bold text-sm px-4 sm:px-5",
            })}
          >
            {t("common.back")}
          </Link>
          <Button
            size="lg"
            block
            loading={isSaving}
            loadingLabel={t("common.saving")}
            disabled={proceedDisabled}
            onClick={onCommit}
            className="font-bold text-sm sm:text-base shadow-md flex-1 text-center"
          >
            {label}
          </Button>
        </div>

    </ApplyDock>
  );
}
