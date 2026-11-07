import { render } from "@testing-library/react-native";

import { CheckoutScreen } from "./checkout-screen";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@vsolve/mobile-core", () => ({
  useAuthStore: (selector: (state: { status: string }) => unknown) => selector({ status: "signedIn" }),
  useMobileOtpFlow: () => ({
    step: "phone",
    phone: "",
    otp: "",
    isPending: false,
    error: null,
    setPhone: jest.fn(),
    setOtp: jest.fn(),
    requestOtp: jest.fn(),
    verifyOtp: jest.fn(),
    reset: jest.fn(),
  }),
}));

jest.mock("@/features/addresses/queries", () => ({
  useAddresses: () => ({ data: [{ id: "addr-1", label: "Home", line1: "12 Lake Road" }] }),
  useCreateAddress: () => ({ mutate: jest.fn(), isPending: false }),
  useUpdateAddress: () => ({ mutate: jest.fn(), isPending: false }),
  useReverseGeocode: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock("@/features/account/queries", () => ({
  useCustomerProfile: () => ({ data: { full_name: "John Doe", phone_number: "+919999999999" } }),
}));

jest.mock("@/features/catalog/client-queries", () => ({
  useServiceDetail: () => ({
    isPending: false,
    data: null,
  }),
}));

jest.mock("@/features/booking/queries", () => ({
  useServiceability: () => ({ isPending: false, data: { is_serviceable: true } }),
}));

jest.mock("@/features/checkout/queries", () => ({
  useCart: () => ({
    data: {
      version: 1,
      items: [{ id: "line-1", service_name: "Painting", quantity: 1 }],
      estimate: { total: { amount_paise: 150000 } },
    },
  }),
  useSchedulingGroups: () => ({ data: [], isPending: false }),
  useCreatePlanSet: () => ({ mutate: jest.fn(), isPending: false, error: null, data: null }),
  useCreatePlanQuote: () => ({ mutate: jest.fn(), isPending: false, error: null }),
  useCreateCheckout: () => ({ mutate: jest.fn(), isPending: false, error: null }),
  usePlanSet: () => ({ data: null, isPending: false }),
  usePlanQuote: () => ({
    data: {
      id: "quote-1",
      status: "ACTIVE",
      total: { amount_paise: 150000 },
      units: [
        {
          id: "u-1",
          total: { amount_paise: 150000 },
          starts_at: "2026-10-15T10:00:00Z",
          arrival_window_minutes: 60,
          lines: [{ id: "l-1", label: "Painting", quantity: 1, amount: { amount_paise: 150000 } }],
        },
      ],
    },
    isPending: false,
  }),
  useCandidateStarts: () => ({ data: null, isPending: false }),
}));

test("checkout shows the cart total", async () => {
  const view = await render(<CheckoutScreen />);
  expect(view.getByText("Painting")).toBeTruthy();
  expect(view.getByText("Total bill")).toBeTruthy();
  expect(view.getByText(/Home/)).toBeTruthy();
});
