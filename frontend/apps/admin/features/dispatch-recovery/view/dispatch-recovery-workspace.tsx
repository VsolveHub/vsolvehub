"use client";

import { Button, Card, Field, Input } from "@vsolve/ui";
import { useState } from "react";

import { DispatchCommands } from "@/features/dispatch-recovery/view/dispatch-commands";
import { DispatchExplanation } from "@/features/dispatch-recovery/view/dispatch-explanation";
import { useDispatchExplanation } from "@/features/dispatch-recovery/queries";
import { isUuid } from "@/features/shared/identifiers";

export function DispatchRecoveryWorkspace() {
  const [typed, setTyped] = useState("");
  const [unitId, setUnitId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const explanation = useDispatchExplanation(unitId);
  // Null until Django has answered. The commands stay unavailable until then,
  // because there is no version to guard them on.
  const unitVersion = explanation.data?.unit_version ?? null;

  return (
    <>
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
    </>
  );
}
