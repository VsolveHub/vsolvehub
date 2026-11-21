import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/operations/payouts",
  useSearchParams: () => new URLSearchParams(""),
}));

import {
  PayoutsAttentionSummary,
  countLabel,
  tally,
  type PayoutsAttention,
} from "./payouts-attention";

const none = { count: 0, more: false, paise: 0 };

function attention(overrides: Partial<PayoutsAttention> = {}): PayoutsAttention {
  return {
    loading: false,
    accounts: none,
    withdrawals: none,
    runsToApprove: none,
    runsToPay: none,
    sending: none,
    ...overrides,
  };
}

describe("tally", () => {
  it("counts rows and sums amounts across pages", () => {
    const pages = [
      { results: [{ paise: 100 }, { paise: 250 }], next: "cursor" },
      { results: [{ paise: 50 }], next: null },
    ];

    expect(tally(pages, (row) => row.paise)).toEqual({ count: 3, more: false, paise: 400 });
  });

  it("says when the server has more than was read", () => {
    const t = tally([{ results: [1, 2], next: "more" }]);

    expect(t.more).toBe(true);
    expect(countLabel(t)).toBe("2+");
  });

  it("is zero, not missing, before anything loads", () => {
    expect(tally(undefined)).toEqual({ count: 0, more: false, paise: 0 });
  });
});

describe("PayoutsAttentionSummary", () => {
  beforeEach(() => replace.mockReset());

  it("shows what is waiting and how much, before any tab is opened", () => {
    render(
      <PayoutsAttentionSummary
        attention={attention({
          withdrawals: { count: 2, more: false, paise: 3110800 },
          accounts: { count: 1, more: false, paise: 0 },
          runsToApprove: { count: 1, more: false, paise: 500000 },
          sending: { count: 1, more: false, paise: 1555400 },
        })}
      />,
    );

    expect(screen.getByRole("button", { name: /Withdrawals to approve\s*2/ })).toHaveTextContent(
      "₹31,108",
    );
    expect(screen.getByRole("button", { name: /Bank accounts to verify\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Payout runs waiting\s*1/ })).toHaveTextContent(
      "1 to approve · 0 to pay",
    );
    expect(screen.getByRole("button", { name: /On the way to banks/ })).toHaveTextContent(
      "₹15,554",
    );
  });

  it("says nothing is waiting rather than hiding an empty queue", () => {
    render(<PayoutsAttentionSummary attention={attention()} />);

    expect(screen.getAllByText("Nothing waiting")).toHaveLength(3);
  });

  it("opens the tab that does the job", () => {
    render(
      <PayoutsAttentionSummary
        attention={attention({ accounts: { count: 1, more: false, paise: 0 } })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Bank accounts to verify/ }));

    expect(replace).toHaveBeenCalledWith("/operations/payouts?tab=accounts", { scroll: false });
  });
});
