"use client";

import { isNotAProject } from "@vsolve/query";
import { Skeleton } from "@vsolve/ui";

import type { ProjectView } from "../adapters";
import { DelayClaimPanel } from "./delay-claim-panel";
import { HandoverPanel } from "./handover-panel";
import { VendorTransferPanel } from "./vendor-transfer-panel";
import { WarrantyPanel } from "./warranty-panel";

/**
 * Where the A5 project read lands on the engagement workspace — `M2-FE-611`,
 * `612`.
 *
 * Two mount points rather than one block, because the two halves belong at
 * different heights on the page and moving either would put it in the wrong
 * argument:
 *
 * - **`ProjectDecisions`** sits with the amendment panel, above the Customer's
 *   final acceptance. A proposed replacement carries a deadline and reprices
 *   every unfinished stage; an unaccepted handover is the thing stopping the
 *   project closing. Both are answers the Customer owes now.
 * - **`ProjectWarranty`** sits below the acceptance, because it is the story
 *   after the work is finished.
 *
 * ## One read, passed in
 *
 * The engagement screen issues `useProject` once and hands the projection to
 * both. Two hooks would share one cache entry and cost nothing extra, but they
 * would also produce two loading states and two error messages for one failed
 * request — and a Customer reading "we could not load this" twice on one page
 * concludes something worse is wrong than actually is.
 *
 * ## Failing quietly, in one direction only
 *
 * A failed project read never blanks the engagement: the stages, the money and
 * the funding controls are all on the engagement's own read and are unaffected.
 * What it must not do is imply an answer — so the decisions slot says plainly
 * that it could not read this part, and the warranty slot renders **nothing**
 * rather than repeating it. Silence there is honest: it is not a claim about
 * cover, and the panel that would make one is precisely the one that failed to
 * load.
 *
 * `m2_stage_transition_not_allowed` is the A3 refusal — a workforce booking has
 * shift-days, not milestones — and is a screen that should not have mounted
 * rather than an error to show anybody. It renders as nothing at all.
 */

export interface ProjectSlotProps {
  engagementId: string;
  /** Null while loading, or when the read failed. */
  project: ProjectView | null;
  isPending: boolean;
  error: unknown;
  /** "project" — the noun this agreement uses. */
  engagementNoun: string;
  /** "stage" / "stages". */
  stageNoun: string;
  stagesNoun: string;
  onDone: () => void;
}

export interface ProjectDecisionsProps extends ProjectSlotProps {
  /**
   * Whether to explain the replacement route when no transfer exists.
   *
   * True only where it is a live question — a disputed or cancelled project.
   * A permanent "what if they walk away" block on a job that is going fine is
   * noise, and noise on this surface is what stops the real notice being read.
   */
  showRecoveryRoute: boolean;
}

export function ProjectDecisions({
  engagementId,
  project,
  isPending,
  error,
  engagementNoun,
  stageNoun,
  stagesNoun,
  onDone,
  showRecoveryRoute,
}: ProjectDecisionsProps) {
  if (isPending) {
    return (
      <div className="mt-8" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading this {engagementNoun}&apos;s detail</span>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (project === null) {
    // The A3 refusal is not an error to render — this component should not have
    // been mounted on a workforce booking at all.
    if (isNotAProject(error)) return null;
    return (
      <p className="mt-8 max-w-prose text-sm leading-6 text-text-secondary">
        We could not read the delivery and warranty detail for this{" "}
        {engagementNoun} just now, so we are not going to show you a version of
        it we cannot vouch for. Everything above comes from the agreement itself
        and is unaffected. Reload the page to try again.
      </p>
    );
  }

  return (
    <>
      {/* Above the transfer and the handover, because it is the one on a clock
          the Customer loses by ignoring. An unanswered delay claim lapses and
          the agreed dates stand — a good outcome to arrive at deliberately and
          a poor one to arrive at by not scrolling. */}
      <DelayClaimPanel
        engagementId={engagementId}
        claims={project.delayClaims}
        engagementNoun={engagementNoun}
        stageNoun={stageNoun}
        stagesNoun={stagesNoun}
        onDone={onDone}
      />

      {project.transfer !== null ? (
        <VendorTransferPanel
          engagementId={engagementId}
          transfer={project.transfer}
          leftWithVendor={project.leftWithVendor}
          engagementNoun={engagementNoun}
          stageNoun={stageNoun}
          stagesNoun={stagesNoun}
          onDone={onDone}
        />
      ) : showRecoveryRoute ? (
        <RecoveryRoute engagementNoun={engagementNoun} stageNoun={stageNoun} />
      ) : null}

      <HandoverPanel
        engagementId={engagementId}
        handover={project.handover}
        engagementNoun={engagementNoun}
        onDone={onDone}
      />
    </>
  );
}

export function ProjectWarranty({
  project,
  isPending,
  engagementNoun,
}: Pick<ProjectSlotProps, "project" | "isPending" | "engagementNoun">) {
  // Nothing, in both the loading and the failed case. See the header: silence
  // here is not a claim about cover, and a second error message for one failed
  // request reads as a bigger fault than there is.
  if (isPending || project === null) return null;
  return <WarrantyPanel retention={project.retention} engagementNoun={engagementNoun} />;
}

/**
 * What actually happens if the professional cannot finish — the honest answer,
 * which is a real mechanism rather than a placeholder.
 *
 * Shown only on a project that is stuck. It exists because the alternative on a
 * stalled job is a Customer concluding their funded money is trapped with
 * somebody who has stopped answering, and the truth is the opposite: unearned
 * funding comes back before anything else moves.
 *
 * It offers no control on purpose. **Operations proposes a replacement and the
 * Customer accepts it** — there is no Customer-side initiation in this contract,
 * and a button that only wrote a support ticket would be dressed up as one.
 */
function RecoveryRoute({
  engagementNoun,
  stageNoun,
}: {
  engagementNoun: string;
  stageNoun: string;
}) {
  return (
    <section aria-labelledby="recovery-heading" className="mt-8">
      <h2 id="recovery-heading" className="text-lg font-semibold text-text">
        If the professional cannot finish
      </h2>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        We find somebody else and ask them to price every {stageNoun} that is
        left, one by one. You see both sets of prices side by side and decide —
        nothing moves until you do. Anything you have funded that nobody
        has earned is refunded to you first, and there is no separate charge for
        the change itself; you go on funding the remaining work one piece at a
        time, at the prices you accepted. Contact support about this{" "}
        {engagementNoun} to start that.
      </p>
    </section>
  );
}
