// Ported from frontend/apps/customer/features/payment/queries.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import { queryKeys } from "@vsolve/query/native";
import type { ReactNode } from "react";

import {
  paymentIntentKey,
  useCheckoutPayment,
  useStartPayment,
  type PaymentAttempt,
} from "./queries";

const mockClient = {
  GET: jest.fn(),
  POST: jest.fn(),
  PATCH: jest.fn(),
  PUT: jest.fn(),
  DELETE: jest.fn(),
};

jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => mockClient,
}));

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

const ATTEMPT: PaymentAttempt = {
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
  amount: { amount_paise: 250000, currency: "INR" },
  wallet_reserved_paise: 5000,
  coins_burned: 50,
  coin_discount_paise: 5000,
  razorpay_amount_paise: 240000,
  expires_at: null,
  allocations: [],
  created_at: "2026-08-04T11:55:00.000Z",
  updated_at: "2026-08-04T11:55:00.000Z",
};

describe("paymentIntentKey", () => {
  it("is stable for identical inputs", () => {
    const input = {
      checkoutId: "checkout-1",
      expectedCheckoutVersion: 3,
      walletAmountPaise: 5000,
      coinBurnAmount: 50,
    };
    expect(paymentIntentKey(input)).toBe(paymentIntentKey(input));
  });

  it("changes when checkout version changes", () => {
    const key1 = paymentIntentKey({ checkoutId: "checkout-1", expectedCheckoutVersion: 3 });
    const key2 = paymentIntentKey({ checkoutId: "checkout-1", expectedCheckoutVersion: 4 });
    expect(key1).not.toBe(key2);
  });

  it("changes when walletAmountPaise or coinBurnAmount changes", () => {
    const key1 = paymentIntentKey({
      checkoutId: "checkout-1",
      expectedCheckoutVersion: 3,
      walletAmountPaise: 0,
      coinBurnAmount: 0,
    });
    const key2 = paymentIntentKey({
      checkoutId: "checkout-1",
      expectedCheckoutVersion: 3,
      walletAmountPaise: 1000,
      coinBurnAmount: 0,
    });
    const key3 = paymentIntentKey({
      checkoutId: "checkout-1",
      expectedCheckoutVersion: 3,
      walletAmountPaise: 0,
      coinBurnAmount: 50,
    });
    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key2).not.toBe(key3);
  });
});

describe("useStartPayment", () => {
  let queryClient: QueryClient;

  function createWrapper() {
    return function QueryWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it("sends version, loyalty amounts, and idempotency key", async () => {
    mockClient.POST.mockResolvedValue(ok(ATTEMPT, 202));

    const { result } = await renderHook(() => useStartPayment(), { wrapper: createWrapper() });
    await result.current.mutateAsync({
      checkoutId: "checkout-1",
      expectedCheckoutVersion: 3,
      groupId: "group-1",
      walletAmountPaise: 5000,
      coinBurnAmount: 50,
    });

    expect(mockClient.POST).toHaveBeenCalledWith(
      "/api/v1/payment-attempts/",
      expect.objectContaining({
        body: {
          checkout_id: "checkout-1",
          expected_checkout_version: 3,
          wallet_amount_paise: 5000,
          coin_burn_amount: 50,
        },
        params: {
          header: {
            "Idempotency-Key": expect.any(String),
          },
        },
      }),
    );

    expect(queryClient.getQueryData(queryKeys.payment.attempt("attempt-1"))).toEqual(ATTEMPT);
    expect(queryClient.getQueryData(queryKeys.payment.forCheckout("checkout-1"))).toEqual(ATTEMPT);
  });
});

describe("useCheckoutPayment", () => {
  let queryClient: QueryClient;

  function createWrapper() {
    return function QueryWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it("reads the payment attempt for checkout", async () => {
    mockClient.GET.mockResolvedValue(ok(ATTEMPT));

    const { result } = await renderHook(() => useCheckoutPayment("checkout-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockClient.GET).toHaveBeenCalledWith(
      "/api/v1/checkouts/{checkout_id}/payment/",
      expect.objectContaining({
        params: expect.objectContaining({
          path: { checkout_id: "checkout-1" },
        }),
      }),
    );
    expect(result.current.data).toEqual(ATTEMPT);
  });
});
