import { DispatchRecoveryWorkspace } from "@/features/dispatch-recovery/view/dispatch-recovery-workspace";

/**
 * Dispatch recovery: read why a visit went where it went, then correct it.
 *
 * The read comes first on the page and first in the workflow, and that is not a
 * layout preference. Every command below is guarded on the `version` this read
 * publishes, so a console that let an operator revoke an offer before reading
 * the visit would be asking them to guess the guard.
 *
 * The unit id is typed rather than selected. The contract publishes no
 * Operations queue of stuck visits — `dispatch-explanation` is addressed by unit
 * and nothing lists them — so the id comes from the case being worked. It is
 * kept in component state rather than the URL, like the review and rule queues:
 * a link that drops somebody straight onto three destructive commands, with none
 * of the context that says whether they are warranted, is not a link worth
 * having.
 */
export default function DispatchRecoveryPage() {
  return (
    <>

      <DispatchRecoveryWorkspace />
    </>
  );
}
