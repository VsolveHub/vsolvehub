"use client";

import { Button, Card, Field, Input } from "@vsolve/ui";
import { useState } from "react";

import { DispatchCommands } from "@/features/dispatch-recovery/view/dispatch-commands";
import { DispatchExplanation } from "@/features/dispatch-recovery/view/dispatch-explanation";
import { useDispatchExplanation } from "@/features/dispatch-recovery/queries";
import { OperationsShell } from "@/features/session/operations-shell";
import { isUuid } from "@/features/shared/identifiers";

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
  const [typed, setTyped] = useState("");
  const [unitId, setUnitId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const explanation = useDispatchExplanation(unitId);
  // Null until Django has answered. The commands stay unavailable until then,
  // because there is no version to guard them on.
  const unitVersion = explanation.data?.unit_version ?? null;

  return (
    <OperationsShell>
      <h1 className="text-2xl font-bold text-text">Dispatch recovery</h1>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        Read who a visit was offered to and why, then revoke an offer, release a
        held slot, or run recovery. Every command is recorded against your
        account and guarded on the version you are looking at.
      </p>

      <Card className="mt-6 p-5">
        <Field
          label="Fulfilment unit id"
          description="The visit you are working. Taken from the case — this console publishes no queue of stuck visits."
          required
          error={submitted && !isUuid(typed) ? "Paste the fulfilment unit id." : undefined}
        >
          <Input
            value={typed}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
          />
        </Field>
        <Button
          className="mt-4"
          onClick={() => {
            setSubmitted(true);
            if (isUuid(typed)) setUnitId(typed.trim());
          }}
        >
          Read this visit
        </Button>
      </Card>

      <div className="mt-6 flex flex-col gap-6">
        <DispatchExplanation unitId={unitId} />
        <DispatchCommands unitId={unitId} unitVersion={unitVersion} />
      </div>
    </OperationsShell>
  );
}
