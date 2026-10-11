"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Card, Field, Textarea } from "@vsolve/ui";
import { useState } from "react";

import type { OperationsCase } from "../model/cases";
import { useDecideSafetyIncident, useDecideStageDispute } from "../queries";

/** Which source command, if any, this case can drive. Exported for tests. */
export function sourceDecisionKind(item: Pick<OperationsCase, "source_kind" | "source_id">):
  | "stage"
  | "safety"
  | null {
  if (!item.source_id) return null;
  if (item.source_kind === "engagement_stage") return "stage";
  if (item.source_kind === "safety_incident") return "safety";
  return null;
}

/**
 * The decision on the thing the case is about.
 *
 * A disputed milestone stays disputed, and a safety report stays open, until somebody decides
 * it here. Resolving the case afterwards records the finding and releases the payout hold; the
 * two are separate on purpose, so the order is spelled out on screen.
 */
export function SourceDecisionPanel({ item }: { item: OperationsCase }) {
  const kind = sourceDecisionKind(item);
  if (kind === "stage") return <StageDecision stageId={item.source_id as string} />;
  if (kind === "safety") return <SafetyDecision incidentId={item.source_id as string} />;
  return null;
}

function StageDecision({ stageId }: { stageId: string }) {
  const decide = useDecideStageDispute();
  const [note, setNote] = useState("");
  const ready = note.trim() !== "" && !decide.isPending;

  return (
    <Card className="p-5">
      <h3 className="text-base font-bold text-text">Step 1 · Decide the disputed milestone</h3>
      <p className="mt-1 text-sm text-text-secondary">
        Approve it if the work is done; the vendor gets paid for it. Send it back if it is not; the
        vendor must fix it and submit again. Then resolve the case below.
      </p>
      <Field label="What you found" required className="mt-3">
        <Textarea value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={!ready}
          loading={decide.isPending && decide.variables?.outcome === "APPROVE"}
          onClick={() => decide.mutate({ stageId, outcome: "APPROVE", note: note.trim() })}
        >
          Approve milestone
        </Button>
        <Button
          variant="outline"
          disabled={!ready}
          loading={decide.isPending && decide.variables?.outcome === "REQUEST_CORRECTION"}
          onClick={() => decide.mutate({ stageId, outcome: "REQUEST_CORRECTION", note: note.trim() })}
        >
          Send back for correction
        </Button>
      </div>
      {decide.isSuccess ? (
        <p className="mt-2 text-sm text-success-text">
          Milestone is now {decide.data?.status?.replaceAll("_", " ").toLowerCase()}. Resolve the case next.
        </p>
      ) : null}
      {decide.isError ? (
        <p role="alert" className="mt-2 text-sm text-danger-text">
          {friendlyErrorMessage(decide.error)}
        </p>
      ) : null}
    </Card>
  );
}

function SafetyDecision({ incidentId }: { incidentId: string }) {
  const decide = useDecideSafetyIncident();
  const [note, setNote] = useState("");

  return (
    <Card className="p-5">
      <h3 className="text-base font-bold text-text">Step 1 · Work the safety report</h3>
      <p className="mt-1 text-sm text-text-secondary">
        Mark it under review while you investigate. Close it once you can say what was done; that
        account is kept with the report, which nobody can edit. Then resolve the case below.
      </p>
      <Field label="What was done" className="mt-3" description="Required to close the report.">
        <Textarea value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={decide.isPending}
          loading={decide.isPending && decide.variables?.decision === "UNDER_REVIEW"}
          onClick={() =>
            decide.mutate({ incidentId, decision: "UNDER_REVIEW", resolutionNote: note.trim() })
          }
        >
          Mark under review
        </Button>
        <Button
          disabled={decide.isPending || note.trim() === ""}
          loading={decide.isPending && decide.variables?.decision === "RESOLVED"}
          onClick={() => decide.mutate({ incidentId, decision: "RESOLVED", resolutionNote: note.trim() })}
        >
          Close the report
        </Button>
      </div>
      {decide.isSuccess ? (
        <p className="mt-2 text-sm text-success-text">
          Report is now {decide.data?.status?.replaceAll("_", " ").toLowerCase()}.
        </p>
      ) : null}
      {decide.isError ? (
        <p role="alert" className="mt-2 text-sm text-danger-text">
          {friendlyErrorMessage(decide.error)}
        </p>
      ) : null}
    </Card>
  );
}
