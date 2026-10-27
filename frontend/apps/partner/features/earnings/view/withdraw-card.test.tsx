import { I18nProvider } from "@vsolve/ui";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutate = vi.fn();

vi.mock("../queries", () => ({
  useWithdrawalPreview: vi.fn(),
  usePartnerWithdrawals: vi.fn(),
  useRequestWithdrawal: vi.fn(),
  isWithdrawalRefused: vi.fn(() => false),
}));

import { catalogs } from "@/i18n/catalogs";

import { usePartnerWithdrawals, useRequestWithdrawal, useWithdrawalPreview } from "../queries";
import { WithdrawCard } from "./withdraw-card";

const PREVIEW = {
  is_enabled: true,
  can_withdraw: true,
  refusal_reason: null,
  refusal_message: null,
  amount_paise: 450_000,
  fee_paise: 0,
  send_paise: 450_000,
  needs_review: false,
  review_reasons: [],
  minimum_paise: 10_000,
  maximum_paise: 2_500_000,
  withdrawals_left_today: 2,
  free_withdrawals_left_this_week: 1,
  account_last4: "9012",
  account_payable_from: null,
  currency: "INR",
  server_now: "2026-10-27T10:00:00Z",
};

const WITHDRAWAL = {
  id: "w-1",
  status: "SENT",
  is_awaiting_review: false,
  balance_paise: 300_000,
  fee_paise: 0,
  amount_paise: 300_000,
  currency: "INR",
  account_last4: "9012",
  utr: "",
  failure_message: null,
  requested_at: "2026-10-26T10:00:00Z",
  sent_at: "2026-10-26T10:00:05Z",
  completed_at: null,
};

function withPreview(preview: Record<string, unknown> | null) {
  vi.mocked(useWithdrawalPreview).mockReturnValue(
    (preview
      ? { data: preview, isPending: false, isError: false }
      : { data: undefined, isPending: false, isError: true }) as never,
  );
}

function withWithdrawals(items: Record<string, unknown>[]) {
  vi.mocked(usePartnerWithdrawals).mockReturnValue({
    data: { pages: [{ results: items }] },
    isPending: false,
    hasNextPage: false,
  } as never);
}

describe("WithdrawCard", () => {
  beforeEach(() => {
    mutate.mockReset();
    vi.mocked(useRequestWithdrawal).mockReturnValue({
      mutate,
      isPending: false,
      error: null,
    } as never);
    withWithdrawals([]);
  });

  it("draws nothing while withdrawals are switched off", () => {
    withPreview({ ...PREVIEW, is_enabled: false, can_withdraw: false });
    const { container } = render(<WithdrawCard />);

    expect(container).toBeEmptyDOMElement();
  });

  it("withdraws the whole balance only after the confirmation names the amount and account", () => {
    withPreview(PREVIEW);
    render(<WithdrawCard />);

    fireEvent.click(screen.getByRole("button", { name: "Withdraw ₹4,500" }));
    expect(mutate).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/whole ready balance/)).toBeInTheDocument();
    expect(within(dialog).getByText("9012")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("says why the button is off instead of hiding it", () => {
    withPreview({
      ...PREVIEW,
      can_withdraw: false,
      refusal_reason: "below_minimum",
      refusal_message: "You can withdraw once your available balance reaches ₹100.",
      amount_paise: 4_000,
      send_paise: 4_000,
    });
    render(<WithdrawCard />);

    expect(screen.getByRole("button", { name: "Withdraw" })).toBeDisabled();
    expect(screen.getByText(/reaches ₹100/)).toBeInTheDocument();
  });

  it("tells the Partner a first withdrawal is checked before it is sent", () => {
    withPreview({ ...PREVIEW, needs_review: true, review_reasons: ["first_payout_to_account"] });
    render(<WithdrawCard />);

    fireEvent.click(screen.getByRole("button", { name: "Withdraw ₹4,500" }));

    expect(screen.getByText(/Our team checks it first/)).toBeInTheDocument();
  });

  it("shows the fee for an extra withdrawal", () => {
    withPreview({ ...PREVIEW, fee_paise: 1_000, send_paise: 449_000 });
    render(<WithdrawCard />);

    expect(screen.getByRole("button", { name: "Withdraw ₹4,490" })).toBeInTheDocument();
    expect(screen.getByText(/less a ₹10 fee/)).toBeInTheDocument();
  });

  it("follows a withdrawal to the bank, and says the money came back when it failed", () => {
    withPreview({
      ...PREVIEW,
      can_withdraw: false,
      refusal_reason: "withdrawal_in_progress",
      refusal_message: "A withdrawal is already on its way.",
    });
    withWithdrawals([
      WITHDRAWAL,
      {
        ...WITHDRAWAL,
        id: "w-0",
        status: "FAILED",
        failure_message: "The bank did not accept this payment. The money is back in your balance.",
      },
    ]);
    render(<WithdrawCard />);

    expect(screen.getAllByText("Sent to bank").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText(/The money is back in your balance/)).toBeInTheDocument();
  });

  it("offers the way to add a bank account when that is what stands in the way", () => {
    withPreview({
      ...PREVIEW,
      can_withdraw: false,
      refusal_reason: "no_payout_account",
      refusal_message: "Add your bank account to withdraw.",
      account_last4: null,
    });
    render(
      <I18nProvider locale="en-IN" catalog={catalogs["en-IN"]}>
        <WithdrawCard />
      </I18nProvider>,
    );

    // A plain anchor to the card on this page: a same-page <Link> would fire no hashchange.
    expect(screen.getByRole("link", { name: "Add bank account" })).toHaveAttribute(
      "href",
      "#add-bank-account",
    );
  });
});
