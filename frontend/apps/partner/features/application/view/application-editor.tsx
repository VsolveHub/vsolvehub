"use client";

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { Button, ErrorState, Spinner } from "@vsolve/ui";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import {
  changedFields,
  draftFromApplication,
  isDirty,
  type ApplicationDraft,
} from "../model/draft";
import { isEditable } from "../model/readiness";
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

export interface ApplicationEditorProps {
  title: string;
  description?: string;
  children: (props: ApplicationEditorRenderProps) => ReactNode;
  /**
   * Blockers this step cannot resolve, named so the save button explains itself
   * instead of being mysteriously disabled.
   */
  saveLabel?: string;
}

export function ApplicationEditor(props: ApplicationEditorProps) {
  const query = usePartnerApplication();

  // A 404 is "you have not started yet", which is a state, not a failure.
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <p className="flex items-center gap-2 py-8 text-text-secondary">
        <Spinner size="sm" />
        Loading your application…
      </p>
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
  saveLabel = "Save and continue",
  children,
}: ApplicationEditorProps & { application: Application | null }) {
  const [draft, setDraft] = useState(() => draftFromApplication(application));
  const save = useUpdateApplication();

  const isReadOnly = application !== null && !isEditable(application);
  const dirty = isDirty(draft, application);

  const fieldErrors =
    save.error instanceof ApiRequestError ? save.error.fieldErrors : {};
  const fieldMessages = Object.entries(fieldErrors).flatMap(([field, messages]) =>
    messages.map((message) => `${field}: ${message}`),
  );

  function update(patch: Partial<ApplicationDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    save.reset();
  }

  return (
    <section>
      <h1 className="text-xl font-bold text-text sm:text-2xl">{title}</h1>
      {description ? (
        <p className="mt-1.5 max-w-prose text-sm text-text-secondary">{description}</p>
      ) : null}

      {isReadOnly ? (
        <p
          role="status"
          className="mt-4 rounded-card border border-line bg-surface-sunken p-4 text-sm text-text-secondary"
        >
          Your application is with a reviewer, so it cannot be changed right now.
          If something needs correcting, we will tell you what and reopen it.
        </p>
      ) : null}

      <div className="mt-6">{children({ draft, update, application, isReadOnly })}</div>

      {isReadOnly ? null : (
        <div className="mt-8 border-t border-line pt-4">
          {save.isSuccess && !dirty ? (
            <p role="status" className="mb-3 text-sm font-medium text-success-text">
              Saved.
            </p>
          ) : null}

          {isVersionConflict(save.error) ? (
            <ErrorState
              inline
              className="mb-3"
              severity="warning"
              title="Someone else changed this application"
              message="We have reloaded the latest version so you can see it before saving again. Your last change was not applied."
            />
          ) : save.isError && fieldMessages.length === 0 ? (
            <ErrorState
              inline
              className="mb-3"
              title="We could not save this"
              message="Nothing was changed. Check your connection and try again."
              reference={
                save.error instanceof ApiRequestError ? save.error.requestId : null
              }
            />
          ) : null}

          {fieldMessages.length > 0 ? (
            <ul role="alert" className="mb-3 flex list-none flex-col gap-1 p-0">
              {fieldMessages.map((message) => (
                <li key={message} className="text-sm font-medium text-danger-text">
                  {message}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              disabled={!dirty}
              loading={save.isPending}
              loadingLabel="Saving"
              onClick={() => save.mutate(changedFields(draft, application))}
            >
              {saveLabel}
            </Button>
            <Link
              href="/apply"
              className="min-h-11 content-center font-semibold text-info-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              Back to your application
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
