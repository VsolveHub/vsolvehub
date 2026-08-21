"use client";

import { Badge, Button, Card, ErrorState, Skeleton } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { useState } from "react";

import {
  useIssueProjectCompletionCode,
  useProjectCompletionCode,
} from "../queries";

const TERMINAL = new Set(["COMPLETED", "WARRANTY", "CLOSED"]);

export function ProjectCompletionCodePanel({
  engagementId,
  status,
}: {
  readonly engagementId: string;
  readonly status: string;
}) {
  const [requestedReveal, setRequestedReveal] = useState(false);
  const codeQuery = useProjectCompletionCode(engagementId, !TERMINAL.has(status));
  const issue = useIssueProjectCompletionCode(engagementId);
  const code = codeQuery.data?.code ?? null;
  const revealed = requestedReveal || code !== null;

  if (TERMINAL.has(status)) {
    return (
      <Card className="mt-6 flex items-center gap-3 border-success-line bg-success-surface p-4">
        <span className="text-xl text-success-text" aria-hidden>✓</span>
        <div>
          <h2 className="font-semibold text-success-text">Project completed</h2>
          <p className="text-sm text-success-text">The completion code was verified.</p>
        </div>
      </Card>
    );
  }

  return (
    <section id="completion-code" aria-labelledby="completion-code-heading" className="mt-6">
      <Card className="overflow-hidden border-action/20 p-0">
        <div className="flex items-start gap-3 bg-action-soft p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-action">
            <span className="text-xl font-bold" aria-hidden>✓</span>
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="completion-code-heading" className="font-semibold text-text">
                Finish the project safely
              </h2>
              <Badge tone="info">Your approval</Badge>
            </div>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Check every agreed item first. Share this code only when the whole project is finished;
              the Partner entering it approves every stage and closes the project.
            </p>
          </div>
        </div>
        <div className="p-4">
          {codeQuery.isPending ? <Skeleton className="h-12 w-full" /> : null}
          {codeQuery.isError ? (
            <ErrorState
              title={describeError(codeQuery.error, "read").title}
              message={describeError(codeQuery.error, "read").message}
              severity={describeError(codeQuery.error, "read").severity}
              inline
            />
          ) : null}
          {!codeQuery.isPending && !codeQuery.isError && !codeQuery.data?.can_issue ? (
            <p className="text-sm leading-6 text-text-secondary">
              The code becomes available after every agreed stage is funded and any open issue is resolved.
            </p>
          ) : null}
          {codeQuery.data?.can_issue && (!revealed || code === null) ? (
            <Button
              type="button"
              onClick={() => issue.mutate(undefined, { onSuccess: () => setRequestedReveal(true) })}
              loading={issue.isPending}
              loadingLabel="Creating code"
            >
              Show completion code
            </Button>
          ) : null}
          {revealed && code !== null ? (
            <div className="rounded-card border border-line bg-canvas p-4 text-center" aria-live="polite">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Give this code to the Partner
              </p>
              <p className="mt-2 text-3xl font-extrabold tracking-[0.35em] text-text">{code}</p>
              {codeQuery.data?.expires_at ? (
                <p className="mt-2 text-xs text-text-muted">
                  Expires {new Date(codeQuery.data.expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </p>
              ) : null}
            </div>
          ) : null}
          {issue.isError ? (
            <div className="mt-3">
              <ErrorState
                title={describeError(issue.error, "mutation").title}
                message={describeError(issue.error, "mutation").message}
                severity={describeError(issue.error, "mutation").severity}
                inline
              />
            </div>
          ) : null}
        </div>
      </Card>
    </section>
  );
}
