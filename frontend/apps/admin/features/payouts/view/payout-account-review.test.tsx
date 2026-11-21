import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutate = vi.fn();

vi.mock("../queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../queries")>();
  return {
    ...actual,
    usePayoutAccounts: vi.fn(),
    useReviewPayoutAccount: vi.fn(),
  };
});

import { usePayoutAccounts, useReviewPayoutAccount } from "../queries";
import { PayoutAccountReview } from "./payout-account-review";

const PENDING = {
  id: "acc-1",
  partner_id: "partner-1",
  partner_display_name: "Ravi Kumar",
  partner_phone_number: "+919876543210",
  status: "PENDING",
  account_last4: "9012",
  ifsc: "SBIN0001234",
  holder_name: "Ravi Kumar",
  is_registered_with_provider: true,
  bank_check_provider: "cashfree",
  bank_checked_at: "2026-10-26T10:00:05Z",
  name_at_bank: "RAVI KUMAR",
  name_match_result: "DIRECT_MATCH",
  name_match_score: "100.00",
  is_missing_required_bank_check: false,
  verified_at: null,
  reviewed_by_id: null,
  rejection_reason: "",
  effective_from: "2026-10-27T10:00:00Z",
  created_at: "2026-10-26T10:00:00Z",
};

function withAccounts(rows: Record<string, unknown>[]) {
  vi.mocked(usePayoutAccounts).mockReturnValue({
    data: { pages: [{ results: rows, next: null, previous: null }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
  } as never);
}

function withReview(state: Record<string, unknown> = {}) {
  vi.mocked(useReviewPayoutAccount).mockReturnValue({
    mutate,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    ...state,
  } as never);
}

describe("PayoutAccountReview", () => {
  beforeEach(() => {
    mutate.mockReset();
    withReview();
  });

  it("shows the name the bank holds and how well it matches", () => {
    withAccounts([
      {
        ...PENDING,
        name_at_bank: "SOMEONE ELSE",
        name_match_result: "NO_MATCH",
        name_match_score: "0.00",
      },
    ]);
    render(<PayoutAccountReview onStepUpRequired={vi.fn()} />);

    expect(screen.getByText("SOMEONE ELSE")).toBeInTheDocument();
    expect(screen.getByText("No match")).toBeInTheDocument();
  });

  it("refuses to verify an account the bank was never asked about", () => {
    withAccounts([
      {
        ...PENDING,
        bank_check_provider: "",
        bank_checked_at: null,
        name_at_bank: "",
        name_match_result: "",
        name_match_score: "",
        is_missing_required_bank_check: true,
      },
    ]);
    render(<PayoutAccountReview onStepUpRequired={vi.fn()} />);

    expect(screen.getByText("Not checked with the bank")).toBeInTheDocument();
    expect(
      screen.getByText(/never checked with the bank, so it cannot be verified/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Verify account…" }),
    ).toBeDisabled();
  });

  it("shows the partner next to the masked account and verifies it", () => {
    withAccounts([PENDING]);
    render(<PayoutAccountReview onStepUpRequired={vi.fn()} />);

    expect(screen.getAllByText("Ravi Kumar")).toHaveLength(2);
    expect(screen.getByText(/••••9012 · SBIN0001234/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Verify account…" }));
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Verify account",
      }),
    );

    expect(mutate).toHaveBeenCalledWith(
      { accountId: "acc-1", decision: "verify" },
      expect.anything(),
    );
  });

  it("will not reject without a reason the partner can act on", () => {
    withAccounts([PENDING]);
    render(<PayoutAccountReview onStepUpRequired={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Reject…" }));
    const reject = screen.getByRole("button", { name: "Reject account" });
    expect(reject).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Why it was rejected/), {
      target: { value: "The name does not match the partner's ID." },
    });
    fireEvent.click(reject);

    expect(mutate).toHaveBeenCalledWith(
      {
        accountId: "acc-1",
        decision: "reject",
        reason: "The name does not match the partner's ID.",
      },
      expect.anything(),
    );
  });

  it("does not offer to verify an account the provider never registered", () => {
    withAccounts([{ ...PENDING, is_registered_with_provider: false }]);
    render(<PayoutAccountReview onStepUpRequired={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Verify account…" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/never registered with the payout provider/),
    ).toBeInTheDocument();
  });

  it("explains a self-review refusal in plain words", () => {
    withAccounts([PENDING]);
    withReview({
      isError: true,
      error: { code: "payout_account_self_review" },
    });
    render(<PayoutAccountReview onStepUpRequired={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "a colleague has to review it",
    );
  });

  it("routes a lapsed step-up back to confirmation instead of showing an error", () => {
    withAccounts([PENDING]);
    const onStepUpRequired = vi.fn();
    mutate.mockImplementation(
      (_input, options: { onError: (error: unknown) => void }) =>
        options.onError({ code: "step_up_required" }),
    );
    render(<PayoutAccountReview onStepUpRequired={onStepUpRequired} />);

    fireEvent.click(screen.getByRole("button", { name: "Verify account…" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Verify account",
      }),
    );

    expect(onStepUpRequired).toHaveBeenCalledWith(
      expect.stringContaining("confirmation lapsed"),
    );
  });
});
