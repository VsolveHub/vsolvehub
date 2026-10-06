"use client";

import { Badge, Button, Card, ErrorState, Field, Input, Select, Spinner } from "@vsolve/ui";
import { useState } from "react";

import { isStepUpRequired } from "@/features/finance/queries";

import {
  useReferralAttributions,
  useReviewReferral,
  type OpsReferralAttribution,
  type ReferralAttributionStatus,
} from "../queries";

const STATUS_LABEL: Record<ReferralAttributionStatus, string> = {
  PENDING: "Pending — no completed booking yet",
  QUALIFIED: "Qualified — in waiting period",
  REWARDED: "Approved — reward paid",
  INELIGIBLE: "Rejected",
  REVERSED: "Reversed",
  EXPIRED: "Expired",
};
const STATUS_TONE: Record<ReferralAttributionStatus, "warning" | "info" | "success" | "neutral"> = {
  PENDING: "warning",
  QUALIFIED: "info",
  REWARDED: "success",
  INELIGIBLE: "neutral",
  REVERSED: "neutral",
  EXPIRED: "neutral",
};
const FILTERS: ReferralAttributionStatus[] = ["PENDING", "QUALIFIED", "REWARDED", "INELIGIBLE", "REVERSED"];

function when(value?: string | null): string {
  return value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export function ReferralReviewQueue({ onStepUpRequired }: { onStepUpRequired: (reason: string) => void }) {
  const [status, setStatus] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const rows = useReferralAttributions(status, phone);

  return (
    <div className="grid gap-4">
      <Card padding="md">
        <p className="text-sm text-text-secondary">
          Referrals pay automatically once the waiting period after the friend&apos;s first
          completed booking ends. Reject a suspicious referral before it pays, or reverse one that
          already paid. Both need a reason and are recorded.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {FILTERS.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Phone (referrer or friend)">
            <Input value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} />
          </Field>
          <Button variant="outline" onClick={() => setPhone(phoneInput.trim())}>
            Search
          </Button>
        </div>
      </Card>

      {rows.isPending ? (
        <Spinner />
      ) : rows.isError ? (
        <ErrorState severity="warning" title="Referrals could not be loaded" message="Try again." />
      ) : (rows.data ?? []).length === 0 ? (
        <Card padding="md">
          <p className="text-sm text-text-secondary">No referrals match.</p>
        </Card>
      ) : (
        (rows.data ?? []).map((row) => (
          <ReferralRow key={row.id} row={row} onStepUpRequired={onStepUpRequired} />
        ))
      )}
    </div>
  );
}

function ReferralRow({
  row,
  onStepUpRequired,
}: {
  row: OpsReferralAttribution;
  onStepUpRequired: (reason: string) => void;
}) {
  const review = useReviewReferral();
  const [reason, setReason] = useState("");
  const status = row.status ?? "PENDING";
  const action = status === "REWARDED" ? "reverse" : status === "PENDING" || status === "QUALIFIED" ? "reject" : null;

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-semibold">{row.referrer_phone}</span> invited{" "}
          <span className="font-semibold">{row.referee_phone}</span>
        </div>
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
      </div>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-text-secondary sm:grid-cols-2">
        <div>Program version: {row.program_version_code}</div>
        <div>Signed up: {when(row.attributed_at)}</div>
        <div>Qualified: {when(row.qualified_at)}</div>
        <div>Reward due: {when(row.reward_available_at)}</div>
        <div>Paid: {when(row.rewarded_at)}</div>
        {row.qualifying_source_id ? (
          <div>
            Qualifying {row.qualifying_source_type?.toLowerCase()}: {row.qualifying_source_id}
          </div>
        ) : null}
      </dl>
      {row.rewards.length > 0 ? (
        <ul className="mt-2 text-xs">
          {row.rewards.map((reward, index) => (
            <li key={index}>
              {reward.reward_side === "REFERRER" ? "Referrer" : "New customer"} (payout #
              {reward.payout_sequence_n}): {reward.coins_amount ?? 0} coins
              {reward.wallet_paise ? ` + ₹${reward.wallet_paise / 100} wallet` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {row.review_reason ? (
        <p className="mt-2 text-xs">
          Reviewed by {row.reviewed_by_phone ?? "Operations"} on {when(row.reviewed_at)}: {row.review_reason}
        </p>
      ) : null}

      {action ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Reason (required)" className="min-w-64 flex-1">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Button
            variant="danger"
            loading={review.isPending}
            disabled={reason.trim() === ""}
            onClick={() =>
              review.mutate(
                { id: row.id, action, reason: reason.trim() },
                {
                  onSuccess: () => setReason(""),
                  onError: (error) => {
                    if (isStepUpRequired(error)) {
                      onStepUpRequired("Your confirmation lapsed. Nothing was changed.");
                    }
                  },
                },
              )
            }
          >
            {action === "reject" ? "Reject referral" : "Reverse reward"}
          </Button>
        </div>
      ) : null}
      {review.isError && !isStepUpRequired(review.error) ? (
        <ErrorState inline className="mt-2" severity="warning" title="Not changed" message="The referral may have changed state. Refresh and try again." />
      ) : null}
    </Card>
  );
}
