import { I18nProvider } from "@vsolve/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { catalogs } from "@/i18n/catalogs";

const mutate = vi.fn();

function renderCard() {
  return render(
    <I18nProvider locale="en-IN" catalog={catalogs["en-IN"]}>
      <PayoutAccountCard />
    </I18nProvider>,
  );
}

vi.mock("../queries", () => ({
  usePartnerPayoutAccount: vi.fn(),
  useSubmitPayoutAccount: vi.fn(),
  isNoPayoutAccount: vi.fn(),
}));

import { isNoPayoutAccount, usePartnerPayoutAccount, useSubmitPayoutAccount } from "../queries";
import { PayoutAccountCard } from "./payout-account-card";

const ACCOUNT = {
  id: "acc-1",
  account_last4: "9012",
  ifsc: "SBIN0001234",
  holder_name: "Ravi Kumar",
  verified_at: null,
  effective_from: "2026-10-27T10:00:00Z",
  is_payable_now: false,
  rejection_reason: "",
  created_at: "2026-10-26T10:00:00Z",
};

function withAccount(account: Record<string, unknown> | null) {
  vi.mocked(usePartnerPayoutAccount).mockReturnValue(
    (account
      ? { data: account, isPending: false, isError: false }
      : { data: undefined, isPending: false, isError: true, error: new Error("404") }) as never,
  );
  vi.mocked(isNoPayoutAccount).mockReturnValue(account === null);
}

describe("PayoutAccountCard", () => {
  beforeEach(() => {
    mutate.mockReset();
    vi.mocked(useSubmitPayoutAccount).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      error: null,
    } as never);
  });

  it("asks for bank details when none are registered, and sends the IFSC in capitals", () => {
    withAccount(null);
    renderCard();

    expect(screen.getByText(/Add the bank account Vsolve should pay/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Account holder name/), { target: { value: " Ravi Kumar " } });
    fireEvent.change(screen.getByLabelText(/^Account number/), { target: { value: "123456789012" } });
    fireEvent.change(screen.getByLabelText(/Confirm account number/), {
      target: { value: "123456789012" },
    });
    fireEvent.change(screen.getByLabelText(/IFSC/), { target: { value: "sbin0001234" } });
    fireEvent.click(screen.getByRole("button", { name: "Save bank account" }));

    expect(mutate).toHaveBeenCalledWith(
      {
        holder_name: "Ravi Kumar",
        account_number: "123456789012",
        confirm_account_number: "123456789012",
        ifsc: "SBIN0001234",
      },
      expect.anything(),
    );
  });

  it("says a pending account is being checked, and warns before it is changed", () => {
    withAccount({ ...ACCOUNT, status: "PENDING" });
    renderCard();

    expect(screen.getByText("Being checked")).toBeInTheDocument();
    expect(screen.getByText(/We are checking/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/IFSC/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Change account" }));
    expect(screen.getByText(/Changing your account pauses payouts/)).toBeInTheDocument();
  });

  it("explains a verified account that is still cooling", () => {
    withAccount({ ...ACCOUNT, status: "VERIFIED", verified_at: "2026-10-26T12:00:00Z" });
    renderCard();

    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText(/Payouts to/)).toHaveTextContent("start on");
  });

  it("shows why an account was rejected and lets the partner enter it again", () => {
    withAccount({ ...ACCOUNT, status: "REJECTED", rejection_reason: "The name does not match your ID" });
    renderCard();

    expect(screen.getByText(/The name does not match your ID/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save bank account" })).toBeInTheDocument();
  });
});
