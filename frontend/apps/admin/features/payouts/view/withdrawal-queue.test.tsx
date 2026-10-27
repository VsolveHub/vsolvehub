import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const approve = vi.fn();
const decline = vi.fn();

vi.mock("../queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../queries")>();
  return {
    ...actual,
    useWithdrawals: vi.fn(),
    useApproveWithdrawal: vi.fn(),
    useDeclineWithdrawal: vi.fn(),
  };
});

import { useApproveWithdrawal, useDeclineWithdrawal, useWithdrawals } from "../queries";
import { WithdrawalQueue } from "./withdrawal-queue";

const QUEUED = {
  id: "batch-1",
  reference: "withdrawal-abc",
  status: "PENDING_APPROVAL",
  version: 1,
  review_reasons: ["first_payout_to_account"],
  review_note: "",
  approval_basis: "",
  proposed_by_id: "user-partner",
  approved_by_id: null,
  approved_at: null,
  cancelled_by_id: null,
  cancelled_at: null,
  created_at: "2026-10-27T09:00:00Z",
  transfer: {
    id: "item-1",
    status: "RESERVED",
    partner_id: "partner-1",
    partner_display_name: "Ravi Kumar",
    partner_phone_number: "+919876543210",
    account_last4: "9012",
    account_ifsc: "SBIN0001234",
    account_holder_name: "Ravi Kumar",
    account_verified_at: "2026-10-25T10:00:00Z",
    account_added_at: "2026-10-25T09:00:00Z",
    balance_paise: 450_000,
    fee_paise: 0,
    amount_paise: 450_000,
    currency: "INR",
    utr: "",
    failure_code: "",
    submitted_at: null,
    completed_at: null,
  },
};

function withQueue(rows: Record<string, unknown>[]) {
  vi.mocked(useWithdrawals).mockReturnValue({
    data: { pages: [{ results: rows, next: null, previous: null }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
  } as never);
}

describe("WithdrawalQueue", () => {
  beforeEach(() => {
    approve.mockReset();
    decline.mockReset();
    vi.mocked(useApproveWithdrawal).mockReturnValue({
      mutate: approve,
      isPending: false,
      error: null,
    } as never);
    vi.mocked(useDeclineWithdrawal).mockReturnValue({
      mutate: decline,
      isPending: false,
      error: null,
    } as never);
  });

  it("says why a withdrawal is waiting, and approves it at the version it was read", () => {
    withQueue([QUEUED]);
    render(<WithdrawalQueue onStepUpRequired={vi.fn()} />);

    expect(screen.getByText("First payout to this bank account")).toBeInTheDocument();
    // The amount sent, and the balance it took (no fee on this one).
    expect(screen.getAllByText("₹4,500")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Approve and send" }));

    expect(approve).toHaveBeenCalledWith(
      { batchId: "batch-1", expectedVersion: 1 },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("declines only with a reason the partner can read", () => {
    withQueue([QUEUED]);
    render(<WithdrawalQueue onStepUpRequired={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Decline…" }));
    const send = screen.getByRole("button", { name: "Decline withdrawal" });
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  Please call support to confirm this account.  " },
    });
    fireEvent.click(send);

    expect(decline).toHaveBeenCalledWith({
      batchId: "batch-1",
      expectedVersion: 1,
      reason: "Please call support to confirm this account.",
    });
  });

  it("offers no decision on a withdrawal that is no longer waiting", () => {
    withQueue([{ ...QUEUED, status: "PAYING", review_reasons: [] }]);
    render(<WithdrawalQueue onStepUpRequired={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Approve and send" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("listitem")).getByText("Sending")).toBeInTheDocument();
  });
});
