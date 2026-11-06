"use client";

import { type Schemas } from "@vsolve/api-client";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, Dialog, ErrorState, Field, Input, Spinner } from "@vsolve/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  fetchOpsRentalPlatformFee,
  scheduleOpsRentalPlatformFee,
  withdrawOpsRentalPlatformFee,
} from "./queries";

type Version = Schemas["RentalPlatformFeeVersion"];

const FEE_KEY = ["ops", "rental-platform-fee"] as const;
const WHEN = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function VersionLine({ version, action }: { version: Version; action?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <div className="min-w-0">
        <p className="font-semibold text-text">
          v{version.version} · {version.percent}%
        </p>
        <p className="text-text-secondary">
          From {WHEN.format(new Date(version.effective_from))} · Approval {version.approval_reference}
          {version.created_by_name ? ` · Added by ${version.created_by_name}` : ""}
        </p>
      </div>
      {action}
    </li>
  );
}

/**
 * The rental platform fee, versioned like the crew and project fees. A change is a new version
 * with a Finance approval reference and a start time; earlier versions are kept, so what was
 * charged when, and who approved it, always has an answer. Bookings keep the fee they were made at.
 */
export function RentalPlatformFeeForm() {
  const queryClient = useQueryClient();
  const fee = useQuery({ queryKey: FEE_KEY, queryFn: fetchOpsRentalPlatformFee });
  const [percent, setPercent] = useState("");
  const [reference, setReference] = useState("");
  const [startsLater, setStartsLater] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [confirming, setConfirming] = useState(false);

  const schedule = useMutation({
    mutationFn: () =>
      scheduleOpsRentalPlatformFee({
        percent: Number(percent),
        approvalReference: reference.trim(),
        // `datetime-local` has no zone; the browser reads it as local time, as the operator meant.
        effectiveFrom: startsLater && startsAt ? new Date(startsAt).toISOString() : undefined,
      }),
    onSuccess: (overview) => {
      queryClient.setQueryData(FEE_KEY, overview);
      setPercent("");
      setReference("");
      setStartsLater(false);
      setStartsAt("");
      setConfirming(false);
    },
  });
  const withdraw = useMutation({
    mutationFn: withdrawOpsRentalPlatformFee,
    onSuccess: (overview) => queryClient.setQueryData(FEE_KEY, overview),
  });

  if (fee.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-secondary">
        <Spinner size="sm" /> Loading the rental fee…
      </p>
    );
  }
  if (fee.isError || !fee.data) {
    return <ErrorState title="The rental fee could not be loaded" message="Nothing has changed. Try again." />;
  }

  const data = fee.data;
  const value = Number(percent);
  const ready =
    percent.trim() !== "" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 100 &&
    reference.trim() !== "" &&
    (!startsLater || startsAt !== "");

  return (
    <div className="flex flex-col gap-4">
      <Card padding="md">
        <h3 className="text-base font-bold text-navy-900">In force now</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Added on top of the daily rate. The refundable deposit is not included.
        </p>
        {data.current ? (
          <ul>
            <VersionLine version={data.current} />
          </ul>
        ) : (
          <p className="mt-2 text-sm text-text">No fee is set, so customers are not charged one.</p>
        )}
      </Card>

      {data.upcoming.length > 0 ? (
        <Card padding="md">
          <h3 className="text-base font-bold text-navy-900">Scheduled</h3>
          <ul className="divide-y divide-line">
            {data.upcoming.map((version) => (
              <VersionLine
                key={version.id}
                version={version}
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    loading={withdraw.isPending && withdraw.variables === version.id}
                    onClick={() => withdraw.mutate(version.id)}
                  >
                    Withdraw
                  </Button>
                }
              />
            ))}
          </ul>
          {withdraw.isError ? (
            <p role="alert" className="mt-2 text-sm text-danger-text">
              {friendlyErrorMessage(withdraw.error)}
            </p>
          ) : null}
        </Card>
      ) : null}

      <Card padding="md">
        <h3 className="text-base font-bold text-navy-900">Change the fee</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Adds a new version. Bookings already made keep the fee they were made at.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Percent" required>
            <Input inputMode="numeric" value={percent} onChange={(event) => setPercent(event.target.value)} />
          </Field>
          <Field label="Approval reference" required description="From Finance, e.g. FIN-2026-14.">
            <Input value={reference} maxLength={120} onChange={(event) => setReference(event.target.value)} />
          </Field>
        </div>
        <fieldset className="mt-3 flex flex-col gap-2 text-sm">
          <legend className="mb-1 font-semibold text-text">Takes effect</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="fee-start" checked={!startsLater} onChange={() => setStartsLater(false)} />
            Now
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="fee-start" checked={startsLater} onChange={() => setStartsLater(true)} />
            Later
          </label>
          {startsLater ? (
            <Input
              type="datetime-local"
              aria-label="Takes effect at"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              className="max-w-xs"
            />
          ) : null}
        </fieldset>
        <Button className="mt-3" disabled={!ready} onClick={() => setConfirming(true)}>
          Review change
        </Button>
      </Card>

      {data.history.length > 0 ? (
        <Card padding="md">
          <h3 className="text-base font-bold text-navy-900">Earlier versions</h3>
          <ul className="divide-y divide-line">
            {data.history.map((version) => (
              <VersionLine key={version.id} version={version} action={<Badge tone="neutral">Ended</Badge>} />
            ))}
          </ul>
        </Card>
      ) : null}

      {confirming ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next && !schedule.isPending) setConfirming(false);
          }}
          title={`Set the rental fee to ${value}%?`}
          description={
            startsLater && startsAt
              ? `From ${WHEN.format(new Date(startsAt))}, under approval ${reference.trim()}. You can withdraw it until then.`
              : `From now, under approval ${reference.trim()}. New bookings are charged ${value}% straight away.`
          }
          footer={
            <>
              <Button variant="outline" disabled={schedule.isPending} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button loading={schedule.isPending} loadingLabel="Saving" onClick={() => schedule.mutate()}>
                Add version
              </Button>
            </>
          }
        >
          {schedule.isError ? (
            <p role="alert" className="text-sm text-danger-text">
              {friendlyErrorMessage(schedule.error)}
            </p>
          ) : null}
        </Dialog>
      ) : null}
    </div>
  );
}
