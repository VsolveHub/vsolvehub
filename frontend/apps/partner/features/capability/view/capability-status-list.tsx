"use client";

import { Badge, Card, EmptyState, buttonStyles, cn, useT } from "@vsolve/ui";
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
 * ## The two states this build could not distinguish, and now can
 *
 * A rejection and a withdrawal both used to arrive as `WITHDRAWN`, so this
 * screen named the record's state and committed to no cause. Contract 1.22.0
 * split them, and the copy follows: `REJECTED` leads with support and offers
 * "ask again" second, `WITHDRAWN` leads with "ask again" and offers support
 * second. Neither blocks a fresh request, so both must end somewhere — but not
 * in the same place, because one person was told no and the other changed their
 * mind.
 *
 * A status this build has no words for renders as "we cannot describe this".
 * Never as the nearest thing we do know: guessing is how `WITHDRAWN` came to
 * mean two things in the first place.
 *
 * ## Why the decision carries a date
 *
 * `last_transition.occurred_at` is on the record precisely so a terminal state
 * can say *when*. "We could not approve this" with no date is a sentence nobody
 * can act on — a Partner cannot tell whether it happened this morning or three
 * months ago, and support cannot find it either.
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
  const t = useT();
  return (
    <AsyncSection
      state={state}
      label={t("me.capability.statusList.loading")}
      onRetry={onRetry}
      className={className}
      isEmpty={(rows) => rows.length === 0}
      empty={
        <EmptyState
          title={t("me.capability.statusList.emptyTitle")}
          description={t("me.capability.statusList.emptyDescription")}
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

      <DecidedAt presentation={presentation} />

      <div className="flex flex-wrap items-center gap-3">
        <CapabilityActionControl presentation={presentation} />
        {presentation.secondaryAction ? (
          <CapabilityActionControl
            presentation={{ ...presentation, action: presentation.secondaryAction }}
            variant="secondary"
          />
        ) : null}
      </div>
    </Card>
  );
}

/**
 * When the last decision was taken.
 *
 * From `last_transition.occurred_at`, falling back to `reviewed_at`. Never
 * rendered for a state that has not been decided — "requested on the 3rd" reads
 * as a decision when it is the opposite.
 */
function DecidedAt({ presentation }: { presentation: CapabilityPresentation }) {
  const t = useT();
  if (presentation.decidedAt === null || presentation.isWaiting) return null;

  const parsed = Date.parse(presentation.decidedAt);
  if (Number.isNaN(parsed)) return null;

  return (
    <p className="mt-2 text-xs text-text-muted">
      {t("me.capability.statusList.decidedLabel")}{" "}
      <time dateTime={presentation.decidedAt}>
        {new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeZone: "Asia/Kolkata",
        }).format(parsed)}
      </time>
      {presentation.decisionReasonCode
        ? t("me.capability.statusList.referenceSuffix", { code: presentation.decisionReasonCode })
        : null}
    </p>
  );
}

function CapabilityActionControl({
  presentation,
  variant = "primary",
}: {
  presentation: CapabilityPresentation;
  /** A second route is offered quieter than the first, never as an equal. */
  variant?: "primary" | "secondary";
}) {
  const t = useT();
  const action = presentation.action;
  const chrome =
    variant === "primary"
      ? buttonStyles({ size: "sm", className: "mt-3" })
      : buttonStyles({ variant: "ghost", size: "sm", className: "mt-3" });

  switch (action.kind) {
    case "NONE":
      return null;

    case "WAIT":
      // Says the quiet part out loud. "Nothing to do" is the answer to the
      // question a waiting Partner actually has, and leaving the space blank is
      // how they conclude the screen is unfinished.
      return (
        <p className="mt-3 text-sm text-text-muted">
          {t("me.capability.action.waitMessage")}
        </p>
      );

    case "FIX":
    case "REQUEST_AGAIN":
      return (
        <Link href={action.href} className={chrome}>
          {action.label}
        </Link>
      );

    case "SUPPORT":
      return (
        <Link
          href="/me/profile"
          className={
            variant === "primary"
              ? buttonStyles({ variant: "secondary", size: "sm", className: "mt-3" })
              : chrome
          }
        >
          {action.label}
        </Link>
      );
  }
}
