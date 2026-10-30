"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Card, Field, Input } from "@vsolve/ui";
import { useState } from "react";

import { dayEndIso, dayStartIso, useProposePayoutBatch, useUnpayablePartners } from "../queries";

/**
 * Propose a payout run for a period. A second person approves it, then it is paid.
 *
 * Partners owed money in the period but with no usable bank account are listed first, because
 * they are left out of the run silently otherwise.
 */
export function NewPayoutRun({ onProposed }: { onProposed: (batchId: string) => void }) {
  const propose = useProposePayoutBatch();
  const [reference, setReference] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const periodReady = start !== "" && end !== "" && start <= end;
  const unpayable = useUnpayablePartners(
    periodReady ? { start: dayStartIso(start), end: dayEndIso(end) } : null,
  );
  const missing = unpayable.data?.partner_ids ?? [];

  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-text">New payout run</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Collects every partner earning settled in the period. Someone other than you approves it,
        then it is paid.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Name" required description="e.g. 2026-10 week 2">
          <Input value={reference} maxLength={64} onChange={(event) => setReference(event.target.value)} />
        </Field>
        <Field label="From" required>
          <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
        </Field>
        <Field label="To" required>
          <Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
        </Field>
      </div>
      {start && end && start > end ? (
        <p className="mt-2 text-sm text-danger-text">“From” must be on or before “To”.</p>
      ) : null}
      {periodReady && missing.length > 0 ? (
        <div className="mt-3 rounded-card border border-warning-line bg-warning-surface p-3 text-sm text-warning-text">
          {missing.length} partner{missing.length === 1 ? " is" : "s are"} owed money in this period
          but {missing.length === 1 ? "has" : "have"} no payable bank account, so{" "}
          {missing.length === 1 ? "is" : "are"} left out. Ask them to add one in the partner app.
        </div>
      ) : null}
      <div className="mt-3">
        <Button
          disabled={!periodReady || reference.trim() === ""}
          loading={propose.isPending}
          onClick={() =>
            propose.mutate(
              { reference: reference.trim(), periodStart: dayStartIso(start), periodEnd: dayEndIso(end) },
              {
                onSuccess: (batch) => {
                  setReference("");
                  onProposed(batch.id);
                },
              },
            )
          }
        >
          Propose run
        </Button>
      </div>
      {propose.isError ? (
        <p role="alert" className="mt-2 text-sm text-danger-text">
          {friendlyErrorMessage(propose.error)}
        </p>
      ) : null}
    </Card>
  );
}
