// Ported from frontend/apps/customer/features/payment/view/payment-workspace.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { PayScreen } from "./pay-screen";

const mockClient = {
  GET: jest.fn(),
  POST: jest.fn(),
  PATCH: jest.fn(),
  PUT: jest.fn(),
  DELETE: jest.fn(),
};

jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => mockClient,
  handoffTarget: () => ({ providerOrderId: "order_1", publicKey: "rzp_test_key" }),
  RazorpayCheckout: { open: jest.fn() },
}));

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: () => true,
};

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("@/features/account/view/profile-completion-dialog", () => ({
  useProfileCompletionGate: () => ({
    run: (cb: () => void) => cb(),
    dialog: null,
  }),
}));

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

function notFound() {
  return {
    data: undefined,
    error: {
      error: {
        code: "not_found",
        message: "No payment attempt exists for this checkout.",
        details: null,
        retryable: false,
        request_id: "req_1",
      },
    },
    response: new Response(null, { status: 404 }),
  };
}

const mockGroup = {
  id: "group-1",
  checkout_id: "checkout-1",
  checkout_version: 1,
  recovery_action: "PAYMENT_REQUIRED",
  order_id: null,
  units: [
    {
      id: "unit-1",
      position: 0,
      total: { amount_paise: 50000, currency: "INR" },
      lines: [],
    },
  ],
};

const mockAttemptWithDiscounts = {
  id: "attempt-1",
  checkout_id: "checkout-1",
  booking_group_id: "group-1",
  quote_id: "quote-1",
  purpose: "BOOKING_GROUP",
  provider: "razorpay",
  provider_public_key: "rzp_test_key",
  provider_order_id: "order_abc",
  status: "CREATED",
  reconciliation_state: "PENDING",
  failure_code: "",
  version: 1,
  amount: { amount_paise: 50000, currency: "INR" },
  wallet_reserved_paise: 5000, // ₹50 from wallet
  coins_burned: 50,
  coin_discount_paise: 5000, // ₹50 from coins
  razorpay_amount_paise: 40000,
  expires_at: null,
  allocations: [],
  created_at: "2026-08-04T11:55:00.000Z",
  updated_at: "2026-08-04T11:55:00.000Z",
};

describe("PayScreen", () => {
  let queryClient: QueryClient;

  function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it("renders pay button and triggers start payment with loyalty values", async () => {
    mockClient.GET.mockImplementation((path: string) => {
      if (path === "/api/v1/booking-groups/{group_id}/") return Promise.resolve(ok(mockGroup));
      if (path === "/api/v1/checkouts/{checkout_id}/payment/") return Promise.resolve(notFound());
      if (path === "/api/v1/customer/wallet/")
        return Promise.resolve(ok({ available_balance_paise: 10000 }));
      if (path === "/api/v1/customer/coins/")
        return Promise.resolve(ok({ spendable_coins: 100 }));
      return Promise.resolve(notFound());
    });

    mockClient.POST.mockImplementation((path: string) => {
      if (path === "/api/v1/payment-attempts/") return Promise.resolve(ok(mockAttemptWithDiscounts, 202));
      return Promise.resolve(notFound());
    });

    const view = await render(<PayScreen groupId="group-1" />, { wrapper: QueryWrapper });

    expect(await view.findByText("Pay for your booking")).toBeTruthy();
    expect(await view.findByText("Wallet and coins")).toBeTruthy();

    const continueBtn = view.getByText("Continue to payment");
    fireEvent.press(continueBtn);

    await waitFor(() => {
      expect(mockClient.POST).toHaveBeenCalledWith(
        "/api/v1/payment-attempts/",
        expect.objectContaining({
          body: {
            checkout_id: "checkout-1",
            expected_checkout_version: 1,
            wallet_amount_paise: 0,
            coin_burn_amount: 0,
          },
        }),
      );
    });
  });

  it("renders honest discounts when attempt has coin discount and wallet reservation", async () => {
    mockClient.GET.mockImplementation((path: string) => {
      if (path === "/api/v1/booking-groups/{group_id}/") return Promise.resolve(ok(mockGroup));
      if (path === "/api/v1/checkouts/{checkout_id}/payment/")
        return Promise.resolve(ok(mockAttemptWithDiscounts));
      if (path === "/api/v1/customer/wallet/")
        return Promise.resolve(ok({ available_balance_paise: 0 }));
      if (path === "/api/v1/customer/coins/")
        return Promise.resolve(ok({ spendable_coins: 0 }));
      return Promise.resolve(notFound());
    });

    const view = await render(<PayScreen groupId="group-1" />, { wrapper: QueryWrapper });

    expect(await view.findByText("Amount")).toBeTruthy();
    expect(await view.findByText("Coin discount")).toBeTruthy();
    const discounts = await view.findAllByText("-₹50");
    expect(discounts.length).toBe(2);
    expect(await view.findByText("Paid from wallet")).toBeTruthy();
  });
});
