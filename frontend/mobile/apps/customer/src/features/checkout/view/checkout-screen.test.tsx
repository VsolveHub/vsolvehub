import { render } from "@testing-library/react-native";

import { CheckoutScreen } from "./checkout-screen";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@vsolve/mobile-core", () => ({
  useAuthStore: (selector: (state: { status: string }) => unknown) => selector({ status: "signedIn" }),
}));

jest.mock("@/features/addresses/queries", () => ({
  useAddresses: () => ({ data: [{ id: "addr-1", label: "Home", line1: "12 Lake Road" }] }),
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
}));

test("checkout shows the cart total", async () => {
  const view = await render(<CheckoutScreen />);
  expect(view.getByText("Painting · 1")).toBeTruthy();
  expect(view.getByText(/Total/)).toBeTruthy();
  expect(view.getByText("Home")).toBeTruthy();
});
