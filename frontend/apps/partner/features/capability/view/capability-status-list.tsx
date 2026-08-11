"use client";

import { Badge, Card, EmptyState, buttonStyles, cn } from "@vsolve/ui";
import Link from "next/link";

import { AsyncSection, type AsyncState } from "@/components/async-section";

import type { CapabilityPresentation } from "../adapters/capability-status";

/**
 * Where each capability request stands, and the one thing to do about it.
 *
 * Closes the presentation half of `M2-FE-109`.
 *
 * ## Every state ends in an action or an explicit "nothing to do"
 *
 * A status with no next step is where onboarding loses people — they read
 * "under review", cannot tell whether that is normal, and either give up or
 * message support. So a waiting state says *waiting is correct* in as many
 * words, and every other state carries a control.
 *
 * `CHANGES_REQUIRED` renders the reviewer's own note verbatim. That is not a
 * detail: a generic "some documents need attention" is precisely the copy that
 * sends someone back to re-upload the wrong thing, which the M1 status banner
 * learned before this screen existed.
 *
 * ## Two states this build cannot distinguish
 *
 * A rejection and a withdrawal both arrive as `WITHDRAWN`, and no document
 * carries an expiry. Both are logged in frontend-execution-plan.md §7 and
 * neither is guessed at — `capability-status.ts` names the record's state and
 * commits to no cause. Inventing "we turned this down" from a status that also
 * means "you closed this" would be worse than the vaguer sentence.
 */

export interface CapabilityStatusRow {
  readonly id: string;
  readonly variantName: string;
  readonly presentation: CapabilityPresentation;
}

export interface CapabilityStatusListProps {
  readonly state: AsyncState<readonly CapabilityStatusRow[]>;
  readonly onRetry?: () => void;
  readonly className?: string;
}

export function CapabilityStatusList({
  state,
  onRetry,
  className,
}: CapabilityStatusListProps) {
  return (
    <AsyncSection
      state={state}
      label="Loading what you are approved for"
      onRetry={onRetry}
      className={className}
      isEmpty={(rows) => rows.length === 0}
      empty={
        <EmptyState
          title="You have not asked for any specialist work yet"
          description="Workforce and project work need approval before they switch on. Everything else on your account works as it does today."
        />
      }
    >
      {(rows) => (
        <ul className={cn("flex list-none flex-col gap-3 p-0", className)}>
          {rows.map((row) => (
            <li key={row.id}>
              <CapabilityStatusCard row={row} />
            </li>
          ))}
        </ul>
      )}
    </AsyncSection>
  );
}

function CapabilityStatusCard({ row }: { row: CapabilityStatusRow }) {
  const { presentation } = row;

  return (
    <Card
      // Waiting states are polite; anything needing the Partner interrupts.
      aria-live={presentation.isWaiting ? "polite" : "assertive"}
      className="p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={presentation.tone}>{presentation.label}</Badge>
        <h3 className="text-sm font-semibold text-text">{row.variantName}</h3>
      </div>

      <p className="mt-2 text-sm font-medium text-text">{presentation.headline}</p>
      <p className="mt-1 text-sm leading-6 text-text-secondary">{presentation.detail}</p>

      <CapabilityActionControl presentation={presentation} />
    </Card>
  );
}

function CapabilityActionControl({
  presentation,
}: {
  presentation: CapabilityPresentation;
}) {
  const action = presentation.action;

  switch (action.kind) {
    case "NONE":
      return null;

    case "WAIT":
      // Says the quiet part out loud. "Nothing to do" is the answer to the
      // question a waiting Partner actually has, and leaving the space blank is
      // how they conclude the screen is unfinished.
      return (
        <p className="mt-3 text-sm text-text-muted">
          Nothing to do right now. We will message you when this moves.
        </p>
      );

    case "FIX":
    case "REQUEST_AGAIN":
      return (
        <Link href={action.href} className={buttonStyles({ size: "sm", className: "mt-3" })}>
          {action.label}
        </Link>
      );

    case "SUPPORT":
      return (
        <Link
          href="/profile"
          className={buttonStyles({ variant: "secondary", size: "sm", className: "mt-3" })}
        >
          {action.label}
        </Link>
      );
  }
}
