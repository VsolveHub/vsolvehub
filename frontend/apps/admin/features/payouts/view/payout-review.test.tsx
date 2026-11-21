import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../queries")>();
  return { ...actual, usePayoutBatchPreview: vi.fn() };
});

import {
  usePayoutBatchPreview,
  type PayoutAuditEvent,
  type PayoutBatch,
} from "../queries";
import { RunReviewDialog, describeEvent } from "./payout-review";

const BATCH = {
  id: "batch-1",
  reference: "weekly-47",
  version: 3,
} as PayoutBatch;

const PREVIEW = {
  batch_id: "batch-1",
  version: 3,
  status: "APPROVED",
  items: [
    {
      item_id: "i1",
      partner_id: "p1",
      partner_name: "Ravi Kumar",
      amount_paise: 450_000,
      account_last4: "9012",
      ifsc: "SBIN0001234",
      skip_reason: "",
    },
    {
      item_id: "i2",
      partner_id: "p2",
      partner_name: "Anil",
      amount_paise: 120_000,
      account_last4: "1111",
      ifsc: "HDFC0000001",
      skip_reason: "earning_on_hold",
    },
  ],
  send_count: 1,
  send_total_paise: 450_000,
  skip_count: 1,
  skip_total_paise: 120_000,
  includes_actor: false,
};

function withPreview(data: Record<string, unknown> | undefined) {
  vi.mocked(usePayoutBatchPreview).mockReturnValue({
    data,
    isPending: data === undefined,
    isError: false,
    isFetching: false,
    error: null,
  } as never);
}

function renderDialog(
  overrides: Partial<Parameters<typeof RunReviewDialog>[0]> = {},
) {
  const onConfirm = vi.fn();
  render(
    <RunReviewDialog
      batch={BATCH}
      action="pay"
      isOwnProposal={false}
      pending={false}
      error={null}
      onConfirm={onConfirm}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
  return { onConfirm, dialog: screen.getByRole("dialog") };
}

describe("RunReviewDialog", () => {
  beforeEach(() => vi.mocked(usePayoutBatchPreview).mockReset());

  it("shows who is paid, who is skipped and why, and confirms at the reviewed version", () => {
    withPreview(PREVIEW);
    const { onConfirm, dialog } = renderDialog();

    expect(within(dialog).getByText("Ravi Kumar")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Skipped: Earning is on hold/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Cashfree wallet has at least ₹4,500/),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Start paying · ₹4,500" }),
    );
    expect(onConfirm).toHaveBeenCalledWith(3);
  });

  it("will not confirm a run that pays the operator's own partner account", () => {
    withPreview({ ...PREVIEW, includes_actor: true });
    const { onConfirm, dialog } = renderDialog();

    const confirm = within(dialog).getByRole("button", {
      name: /Start paying/,
    });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText(/your own partner account/),
    ).toBeInTheDocument();
  });

  it("will not confirm when nothing would be sent", () => {
    withPreview({
      ...PREVIEW,
      send_count: 0,
      send_total_paise: 0,
      skip_count: 2,
    });
    const { dialog } = renderDialog();

    expect(
      within(dialog).getByRole("button", { name: "Start paying" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByText(/Nothing would be sent/),
    ).toBeInTheDocument();
  });

  it("asks for a fresh review when the run changed after it was opened", () => {
    withPreview({ ...PREVIEW, version: 4 });
    const { dialog } = renderDialog();

    expect(
      within(dialog).getByRole("button", { name: /Start paying/ }),
    ).toBeDisabled();
    expect(
      within(dialog).getByText(/changed after you opened the review/),
    ).toBeInTheDocument();
  });

  it("tells a proposer approving alone how it is recorded", () => {
    withPreview({ ...PREVIEW, status: "PENDING_APPROVAL" });
    const { dialog } = renderDialog({ action: "approve", isOwnProposal: true });

    expect(
      within(dialog).getByText(/approved by the proposer/),
    ).toBeInTheDocument();
  });
});

function event(overrides: Partial<PayoutAuditEvent>): PayoutAuditEvent {
  return {
    id: "e",
    event_type: "RUN_PROPOSED",
    actor_role: "OPERATIONS",
    actor_id: "u1",
    actor_name: "Sriman",
    approval_basis: "",
    partner_id: null,
    partner_name: "",
    amount_paise: null,
    reason: "",
    details: {},
    occurred_at: "2026-11-21T10:00:00Z",
    ...overrides,
  } as PayoutAuditEvent;
}

describe("describeEvent", () => {
  it("names the approval type and the payer", () => {
    expect(
      describeEvent(
        event({ event_type: "RUN_APPROVED", approval_basis: "SELF" }),
      ),
    ).toBe("Approved by Sriman (by the proposer)");
    expect(
      describeEvent(
        event({
          event_type: "RUN_PAY_STARTED",
          details: { item_count: 2, total_paise: 570_000 },
        }),
      ),
    ).toBe("Payment started by Sriman · 2 transfers, ₹5,700");
  });

  it("says which partner was skipped and why, even when the system skipped them", () => {
    expect(
      describeEvent(
        event({
          event_type: "PARTNER_SKIPPED",
          actor_role: "SYSTEM",
          actor_id: null,
          actor_name: "",
          partner_name: "Anil",
          amount_paise: 120_000,
          reason: "partner_suspended",
        }),
      ),
    ).toBe("Anil skipped (₹1,200): Partner is suspended");
  });

  it("keeps a deleted account's event readable", () => {
    expect(describeEvent(event({ actor_name: "" }))).toBe(
      "Proposed by an Operations user",
    );
  });
});
