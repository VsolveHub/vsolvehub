"use client";

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { Button, buttonStyles, ErrorState, Skeleton, useT, type Translator } from "@vsolve/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  changedFields,
  draftFromApplication,
  isDirty,
  type ApplicationDraft,
} from "../model/draft";
import { previousStep } from "../model/progress";
import { isEditable } from "../model/readiness";
import { nextStep } from "../model/steps";
import { useApplyDockTarget } from "./apply-shell";
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
  setProceedDisabled: (disabled: boolean) => void;
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

const ProceedDisabledSetterContext = createContext<((disabled: boolean) => void) | null>(
  null,
);

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
  // Deliberately no default. An explicit `saveLabel` is a step saying the
  // generic verb is wrong for it — `/apply/consent` passes "Accept and
  // continue" because the applicant is accepting agreements, not saving a
  // form — and a default here would be indistinguishable from that, so every
  // step would win the override and none of the derived labels below would
  // ever show.
  saveLabel,
  continueOnSave = true,
  proceedDisabled = false,
  children,
}: ApplicationEditorProps & { application: Application | null }) {
  const t = useT();
  const [draft, setDraft] = useState(() => draftFromApplication(application));
  const [childProceedDisabled, setChildProceedDisabled] = useState(false);
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
      setProceedDisabled: setChildProceedDisabled,
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
  const nextStepName = following ? t(following.labelKey) : null;
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
    <section className="flex flex-col gap-6">
      <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8 lg:p-10 shadow-sm flex flex-col gap-6">
        <header className="flex flex-col gap-1.5 border-b border-line pb-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-900">
            {t(title)}
          </h1>
          {description ? (
            <p className="text-xs sm:text-sm leading-relaxed text-text-secondary">{t(description)}</p>
          ) : null}
        </header>

        {isReadOnly ? (
          <p
            role="status"
            className="rounded-card border border-info-line bg-info-surface p-4 text-[0.9375rem] leading-relaxed text-info-text"
          >
            {t("apply.editor.readOnlyNotice")}
          </p>
        ) : null}

        <ProceedDisabledSetterContext.Provider value={setChildProceedDisabled}>
          <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>
        </ProceedDisabledSetterContext.Provider>
      </div>

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
    </section>
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
  refusal,
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
  refusal: { title: string; message: string } | null;
  failed: boolean;
  requestId: string | null;
  fieldMessages: readonly string[];
}) {
  const target = useApplyDockTarget();
  const t = useT();

  const dock = (
    <div
      className="shrink-0 border-t border-line bg-surface/95 backdrop-blur-md shadow-lg"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex w-full max-w-2xl lg:max-w-5xl xl:max-w-6xl flex-col gap-2 px-4 py-3 sm:px-6 lg:px-8">
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

        <div className="flex items-center gap-2.5">
          <Link
            href={backHref}
            className={buttonStyles({
              variant: "outline",
              size: "lg",
              className: "justify-center shrink-0 font-bold text-sm px-5",
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

        {nextStepName && (
          <p className="text-center text-[11px] font-semibold text-text-muted">
            {t("apply.editor.autosaveHint", { nextStepName })}
          </p>
        )}
      </div>
    </div>
  );

  /*
    A portal, so the node lives below the scroll container while staying a child
    of this component in the React tree. That is what keeps the button's state —
    saving, saved, refused — wired to the step that owns it, and what makes the
    dock disappear on its own when the step unmounts. Nothing has to remember to
    withdraw it.

    See `useApplyDockTarget` for why there are three cases: no shell renders the
    bar in place, a shell whose container has not attached yet renders nothing
    for one frame, and an element portals.
  */
  if (target === undefined) return dock;
  if (target === null) return null;
  return createPortal(dock, target);
}
