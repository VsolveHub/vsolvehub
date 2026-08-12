"use client";

import { Button, Stepper } from "@vsolve/ui";
import type { ReactNode } from "react";

import { SCREENS, SCREEN_LABELS, isFinalScreen, screenIndex } from "../model/screens";
import { BLOCK_COPY } from "./block-copy";
import { useRequirement } from "./requirement-context";

/**
 * The shell the four screens live in: progress, back, and one forward control.
 *
 * ## Why the block reason is copy and not a disabled button alone
 *
 * A disabled "Next" with no explanation is the most common way a form dead-ends
 * someone: they can see they cannot continue and not why. The guard already
 * returns a *code* (`BlockReason`) rather than a sentence, so the rule stays
 * testable and the wording stays in `./block-copy.ts`, translatable, next to
 * nothing but the other refusals.
 *
 * The button is disabled *and* the reason is stated. Not one or the other. The
 * review screen repeats the pairing for its own submit, which is why the table
 * is a module rather than a constant here.
 */

export interface RequirementWorkspaceProps {
  /** The current screen's content. The route decides which, from `state.screen`. */
  children: ReactNode;
  /**
   * Shown above the screen — the duplicate warning, an offline notice.
   *
   * A slot rather than a prop per notice, because notices are owned by whoever
   * knows the server state and this shell knows none of it.
   */
  notice?: ReactNode;
  /**
   * What "Next" does. Defaults to moving the reducer on.
   *
   * Overridden by the flow container so the screen's own write happens *before*
   * the screen changes: a save that fails has to leave the Customer looking at
   * the field it was about. The shell still owns the guard — it will not call
   * this while `canContinue` is false — so an override cannot skip a rule.
   */
  onAdvance?: () => void;
  /** True while that write is in flight. Keeps "Next" from being pressed twice. */
  isAdvancing?: boolean;
}

export function RequirementWorkspace({
  children,
  notice,
  onAdvance,
  isAdvancing = false,
}: RequirementWorkspaceProps) {
  const { state, blocked, canContinue, advance, back } = useRequirement();
  const goForward = onAdvance ?? advance;

  const steps = SCREENS.map((screen) => ({ id: screen, title: SCREEN_LABELS[screen] }));
  const current = screenIndex(state.screen);
  const isLast = isFinalScreen(state.screen);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <Stepper steps={steps} current={current} label="Your request" />

      {notice}

      <div>{children}</div>

      {/* The final screen owns its own submit control — review *is* the
          confirmation, so a generic "Next" beside it would be a second one. */}
      {!isLast ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            {current > 0 ? (
              <Button variant="secondary" onClick={back} disabled={isAdvancing}>
                Back
              </Button>
            ) : null}
            <Button
              onClick={goForward}
              disabled={!canContinue}
              loading={isAdvancing}
              loadingLabel="Saving"
            >
              Next
            </Button>
          </div>
          {blocked !== null ? (
            <p role="status" className="text-sm text-text-secondary">
              {BLOCK_COPY[blocked]}
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          <Button variant="secondary" onClick={back}>
            Back
          </Button>
        </div>
      )}
    </div>
  );
}
