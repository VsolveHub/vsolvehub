import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../queries", () => ({
  usePartnerBalance: vi.fn(),
  usePartnerLedger: vi.fn(),
  usePartnerPayoutAccount: vi.fn(),
  usePartnerPerformance: vi.fn(),
}));

vi.mock("./earnings-chart", () => ({
  EarningsChart: () => <div>Earnings chart</div>,
  toDailyEarnings: (days: unknown) => days,
}));

import {
  usePartnerBalance,
  usePartnerLedger,
  usePartnerPayoutAccount,
  usePartnerPerformance,
} from "../queries";
import { EarningsPanel } from "./earnings-panel";

describe("EarningsPanel", () => {
  beforeEach(() => {
    vi.mocked(usePartnerBalance).mockReturnValue({
      data: {
        pending_paise: 0,
        available_paise: 0,
        reserved_paise: 0,
        paid_paise: 0,
        currency: "INR",
        server_now: "2026-09-02T12:30:00Z",
      },
      isPending: false,
      isError: false,
    } as never);
    vi.mocked(usePartnerLedger).mockReturnValue({
      data: { pages: [{ results: [] }] },
      isPending: false,
      hasNextPage: false,
    } as never);
    vi.mocked(usePartnerPayoutAccount).mockReturnValue({ data: undefined } as never);
    vi.mocked(usePartnerPerformance).mockReturnValue({
      data: {
        today_net_paise: 755_000,
        today_direct_paise: 755_000,
        today_jobs: 2,
        month_net_paise: 755_000,
        month_direct_paise: 755_000,
        month_jobs: 2,
        average_monthly_net_paise: 755_000,
        lifetime_net_paise: 755_000,
        lifetime_direct_paise: 755_000,
        lifetime_jobs: 2,
        daily: [],
        currency: "INR",
        server_now: "2026-09-02T12:30:00Z",
      },
      isPending: false,
      isError: false,
    } as never);
  });

  it("separates direct-paid earnings from the Vsolve payout balance", () => {
    render(<EarningsPanel />);

    expect(screen.getByText("Total earned this month")).toBeInTheDocument();
    expect(screen.getByText("₹7,550 was paid directly by customers.")).toBeInTheDocument();
    expect(screen.getByText("Vsolve payout balance")).toBeInTheDocument();
    expect(screen.getByText(/Nothing is due from Vsolve/)).toBeInTheDocument();
    expect(screen.getByText("Earned today")).toBeInTheDocument();
    expect(screen.getAllByText(/₹7,550/).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Jobs done this month")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/Direct customer payments are included/)).toBeInTheDocument();
  });
});
