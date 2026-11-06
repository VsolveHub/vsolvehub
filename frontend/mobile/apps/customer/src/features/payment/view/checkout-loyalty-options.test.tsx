// Ported from frontend/apps/customer/features/payment/view/checkout-loyalty-options.tsx
import { fireEvent, render } from "@testing-library/react-native";

import {
  CheckoutLoyaltyOptions,
  loyaltyPaymentAmounts,
  type useCheckoutLoyalty,
} from "./checkout-loyalty-options";

describe("loyaltyPaymentAmounts", () => {
  it("returns zeros when neither wallet nor coins are enabled", () => {
    const result = loyaltyPaymentAmounts({
      payablePaise: 50000,
      availablePaise: 20000,
      useWallet: false,
      discountPaise: 5000,
      appliedCoins: 50,
      useCoins: false,
    });
    expect(result).toEqual({ walletAmountPaise: 0, coinBurnAmount: 0 });
  });

  it("applies coin discount and burns coins when coins enabled", () => {
    const result = loyaltyPaymentAmounts({
      payablePaise: 50000,
      availablePaise: 20000,
      useWallet: false,
      discountPaise: 5000,
      appliedCoins: 50,
      useCoins: true,
    });
    expect(result).toEqual({ walletAmountPaise: 0, coinBurnAmount: 50 });
  });

  it("caps wallet deduction at available balance when wallet enabled", () => {
    const result = loyaltyPaymentAmounts({
      payablePaise: 50000,
      availablePaise: 20000,
      useWallet: true,
      discountPaise: 0,
      appliedCoins: 0,
      useCoins: false,
    });
    expect(result).toEqual({ walletAmountPaise: 20000, coinBurnAmount: 0 });
  });

  it("caps wallet deduction at payable amount when balance exceeds payable", () => {
    const result = loyaltyPaymentAmounts({
      payablePaise: 15000,
      availablePaise: 20000,
      useWallet: true,
      discountPaise: 0,
      appliedCoins: 0,
      useCoins: false,
    });
    expect(result).toEqual({ walletAmountPaise: 15000, coinBurnAmount: 0 });
  });

  it("applies coins first then covers remainder with wallet", () => {
    const result = loyaltyPaymentAmounts({
      payablePaise: 50000, // ₹500
      availablePaise: 40000, // ₹400 available
      useWallet: true,
      discountPaise: 20000, // ₹200 discount from coins
      appliedCoins: 200,
      useCoins: true,
    });
    // remainder after coins = 50000 - 20000 = 30000.
    // wallet caps at remainder = 30000 even though 40000 is available.
    expect(result).toEqual({ walletAmountPaise: 30000, coinBurnAmount: 200 });
  });
});

describe("CheckoutLoyaltyOptions", () => {
  const baseLoyalty: ReturnType<typeof useCheckoutLoyalty> = {
    payablePaise: 50000,
    available: 15000,
    spendable: 100,
    useWallet: false,
    setUseWallet: jest.fn(),
    useCoins: false,
    setUseCoins: jest.fn(),
    discountPaise: 0,
    maxBurnPaise: null,
    walletPaise: 0,
    gatewayPaise: 50000,
    walletAmountPaise: 0,
    coinBurnAmount: 0,
    show: true,
  };

  it("renders nothing when show is false", async () => {
    const loyalty = { ...baseLoyalty, show: false };
    const { toJSON } = await render(<CheckoutLoyaltyOptions loyalty={loyalty} />);
    expect(toJSON()).toBeNull();
  });

  it("renders wallet and coins options when balances exist", async () => {
    const { getByText } = await render(<CheckoutLoyaltyOptions loyalty={baseLoyalty} />);
    expect(getByText("Wallet and coins")).toBeTruthy();
    expect(getByText("Use wallet")).toBeTruthy();
    expect(getByText("Available ₹150")).toBeTruthy();
    expect(getByText("Use V Coins")).toBeTruthy();
    expect(getByText("100 spendable")).toBeTruthy();
  });

  it("toggles wallet when pressed", async () => {
    const setUseWallet = jest.fn();
    const loyalty = { ...baseLoyalty, setUseWallet };
    const { getAllByLabelText } = await render(<CheckoutLoyaltyOptions loyalty={loyalty} />);

    fireEvent.press(getAllByLabelText("Use wallet")[0]);
    expect(setUseWallet).toHaveBeenCalledWith(true);
  });

  it("toggles coins when pressed", async () => {
    const setUseCoins = jest.fn();
    const loyalty = { ...baseLoyalty, setUseCoins };
    const { getAllByLabelText } = await render(<CheckoutLoyaltyOptions loyalty={loyalty} />);

    fireEvent.press(getAllByLabelText("Use V Coins")[0]);
    expect(setUseCoins).toHaveBeenCalledWith(true);
  });

  it("renders breakdown when wallet or coins are active", async () => {
    const loyalty = {
      ...baseLoyalty,
      useWallet: true,
      useCoins: true,
      discountPaise: 5000,
      walletPaise: 15000,
      gatewayPaise: 30000,
    };
    const { getByText } = await render(<CheckoutLoyaltyOptions loyalty={loyalty} />);

    expect(getByText("Coin discount")).toBeTruthy();
    expect(getByText("-₹50")).toBeTruthy();
    expect(getByText("Wallet")).toBeTruthy();
    expect(getByText("-₹150")).toBeTruthy();
    expect(getByText("Left to pay")).toBeTruthy();
    expect(getByText("₹300")).toBeTruthy();
  });
});
