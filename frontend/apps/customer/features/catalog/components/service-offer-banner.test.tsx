import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceOfferBanner } from "./service-offer-banner";

const state = vi.hoisted(() => ({
  session: { isAuthenticated: true },
  coins: {
    data: undefined as
      | {
          spendable_coins: number;
          active_burn_policy: { max_burn_percent?: number; coin_value_paise?: number };
        }
      | undefined,
  },
  coinsEnabled: [] as boolean[],
}));

vi.mock("@/features/session/queries", () => ({ useCustomerSession: () => state.session }));
vi.mock("@/features/coins/queries", () => ({
  useCustomerCoins: ({ enabled }: { enabled: boolean }) => {
    state.coinsEnabled.push(enabled);
    return state.coins;
  },
}));

beforeEach(() => {
  state.session = { isAuthenticated: true };
  state.coins = { data: undefined };
  state.coinsEnabled = [];
});

describe("ServiceOfferBanner", () => {
  it("states the server's cap, balance and its rupee value", () => {
    state.coins.data = {
      spendable_coins: 250,
      active_burn_policy: { max_burn_percent: 20, coin_value_paise: 10 },
    };
    render(<ServiceOfferBanner imageUrl="https://example.test/icon.png" />);

    expect(screen.getByText("Pay up to 20% of this booking with V Coins")).toBeInTheDocument();
    expect(screen.getByText("250 coins")).toBeInTheDocument();
    expect(screen.getByText(/worth ₹25/)).toBeInTheDocument();
  });

  it("shows nothing to a customer with no coins to spend", () => {
    state.coins.data = {
      spendable_coins: 0,
      active_burn_policy: { max_burn_percent: 20, coin_value_paise: 10 },
    };
    const { container } = render(<ServiceOfferBanner imageUrl="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does not ask a guest's browser for a customer-only endpoint", () => {
    state.session = { isAuthenticated: false };
    const { container } = render(<ServiceOfferBanner imageUrl="" />);
    expect(container).toBeEmptyDOMElement();
    expect(state.coinsEnabled.every((enabled) => !enabled)).toBe(true);
  });
});
