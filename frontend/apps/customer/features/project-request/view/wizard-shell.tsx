"use client";

import { Button } from "@vsolve/ui";
import type { ReactNode } from "react";

import { MobileScreen } from "@/features/booking/view/mobile-screen";
import { StepMeter } from "./parts/step-meter";

/**
 * One step of the project brief.
 *
 * A thin wrapper over the shared phone shell rather than a second shell: the
 * header height, the back target, the truncation rule and the docked footer are
 * all identical to A3's, and two shells would drift the first time any of them
 * changed. What this adds is the two-step meter and the navy action.
 *
 * ## Why the action is navy
 *
 * A3's is orange. Orange in this system is *signal* — dispatch now, a crew on
 * its way this morning. A project brief is the considered path: nothing is
 * dispatched, nothing is charged, and the customer is describing rather than
 * buying. Navy is the structural colour and it is what the rest of A5 uses, so
 * the button matches the flow it belongs to rather than the other flow's
 * urgency.
 *
 * ## Continue gates on this screen only
 *
 * `canContinue` is the current step's own answer, never the whole brief's. A
 * wizard that disables step 2's Continue because step 4 is empty is a wizard
 * nobody can finish, and the customer cannot see the reason because it is two
 * screens away.
 */

export interface WizardShellProps {
  title: string;
  /** 1-based. */
  step: number;
  total?: number;
  onBack: () => void;
  onContinue: () => void;
  canContinue: boolean;
  isSaving?: boolean;
  /** Overrides "Continue" on the last step. */
  continueLabel?: string;
  /** One line above the action. Absent on steps where nothing is at stake. */
  reassurance?: string;
  /**
   * A trailing header control, replacing the "n of 4" text.
   *
   * Used by the optional step, where "Skip" is more useful than a position the
   * meter under it is already showing.
   */
  headerAction?: ReactNode;
  children: ReactNode;
}

export function WizardShell({
  title,
  step,
  total = 3,
  onBack,
  onContinue,
  canContinue,
  isSaving = false,
  continueLabel = "Continue",
  reassurance,
  headerAction,
  children,
}: WizardShellProps) {
  return (
    <MobileScreen
      title={title}
      onBack={onBack}
      step={headerAction === undefined ? `${step} of ${total}` : undefined}
      headerAction={headerAction}
      meter={<StepMeter step={step} total={total} />}
      reassurance={reassurance}
      action={
        <Button
          block
          variant="secondary"
          onClick={onContinue}
          disabled={!canContinue}
          loading={isSaving}
          loadingLabel="Saving"
          className="h-[50px] rounded-[11px] text-[15px]"
        >
          {continueLabel}
        </Button>
      }
    >
      {children}
    </MobileScreen>
  );
}
