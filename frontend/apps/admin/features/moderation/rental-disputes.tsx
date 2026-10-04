"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Card, EmptyState, formatMoney } from "@vsolve/ui";
import { useMemo, useState } from "react";

import { decideOpsRentalDispute, fetchOpsRentalDisputes } from "./queries";

type DisputeFilter = "PENDING" | "ALL";

export function RentalDisputeQueue() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<DisputeFilter>("PENDING");
  const queue = useQuery({
    queryKey: ["ops-rental-disputes"],
    queryFn: fetchOpsRentalDisputes,
  });
  const rows = useMemo(() => queue.data ?? [], [queue.data]);
  const pending = rows.filter((row) => row.awaiting_decision);
  const visible = filter === "PENDING" ? pending : rows;

  const decide = useMutation({
    mutationFn: ({ bookingId, decision }: { bookingId: string; decision: "APPROVE" | "REJECT" }) =>
      decideOpsRentalDispute(bookingId, decision),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ops-rental-disputes"] });
    },
  });

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Deposit disputes</h1>
        <p className="text-sm text-text-secondary">
          A partner has asked to keep some of a rental deposit. The money stays held until you
          approve that amount or send the full deposit back.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">{pending.length} waiting for a decision</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={filter === "PENDING" ? "primary" : "outline"}
            onClick={() => setFilter("PENDING")}
          >
            Pending
          </Button>
          <Button
            size="sm"
            variant={filter === "ALL" ? "primary" : "outline"}
            onClick={() => setFilter("ALL")}
          >
            All
          </Button>
        </div>
      </div>
      {queue.isLoading ? <p className="text-sm text-text-secondary">Loading disputes…</p> : null}
      {queue.error ? (
        <p className="text-sm text-danger-text">{friendlyErrorMessage(queue.error)}</p>
      ) : null}
      {decide.error ? (
        <p className="text-sm text-danger-text">{friendlyErrorMessage(decide.error)}</p>
      ) : null}
      {!queue.isLoading && visible.length === 0 ? (
        <EmptyState
          title={filter === "PENDING" ? "No disputes waiting" : "No rental disputes"}
          description="When a partner raises a deposit dispute, the claim and photos show up here."
        />
      ) : null}
      <ul className="flex flex-col gap-3">
        {visible.map((row) => (
          <li key={row.booking_id}>
            <Card padding="md" className="flex flex-col gap-3">
              <div>
                <p className="font-semibold text-navy-900">{row.asset_title}</p>
                <p className="text-sm text-text-secondary">{row.partner_name}</p>
              </div>
              <p className="text-sm text-text">{row.reason}</p>
              <p className="text-sm text-text-secondary">
                Deposit {formatMoney(row.deposit_amount_paise)}. Partner asked to keep{" "}
                {formatMoney(row.requested_consume_paise)}.
                {row.awaiting_decision
                  ? " The rest goes back to the customer if you approve."
                  : ` Decided. Kept ${formatMoney(row.consumed_paise)}.`}
              </p>
              {row.photos.length > 0 ? (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {row.photos.map((photo) => (
                    <li key={photo.id}>
                      <a href={photo.url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.url}
                          alt="Dispute evidence"
                          className="aspect-square w-full rounded-card object-cover"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-secondary">No photos attached.</p>
              )}
              {row.awaiting_decision ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={decide.isPending}
                    onClick={() =>
                      decide.mutate({ bookingId: row.booking_id, decision: "APPROVE" })
                    }
                  >
                    Approve claim
                  </Button>
                  <Button
                    variant="danger"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ bookingId: row.booking_id, decision: "REJECT" })}
                  >
                    Return full deposit
                  </Button>
                </div>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
