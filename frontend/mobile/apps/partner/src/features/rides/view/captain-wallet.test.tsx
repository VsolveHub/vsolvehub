import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { CaptainWallet } from "./captain-wallet";

const mockBuyPass = jest.fn();
const mockCheckout = jest.fn();
let mockStatus: Record<string, unknown>;

const FREE = { id: "free", code: "launch-pass", name: "Launch pass", price_paise: 0, duration_hours: 24 };
const PAID = { id: "paid", code: "day-pass", name: "Day pass", price_paise: 4900, duration_hours: 24 };
const ACTIVE = {
  id: "p1",
  plan: FREE,
  status: "ACTIVE",
  starts_at: "2026-11-11T08:00:00Z",
  ends_at: "2026-11-12T08:00:00Z",
  payment_attempt_id: null,
  created_at: "2026-11-11T08:00:00Z",
};

jest.mock("@vsolve/mobile-core", () => ({ useCompleteOrOpenCheckout: () => mockCheckout }));
jest.mock("../queries", () => ({
  buyPass: (id: string) => mockBuyPass(id),
  captainStatusKey: ["rides", "me"],
  passesKey: ["rides", "passes"],
  useCaptainStatus: () => mockStatus,
  usePassPlans: () => ({ isPending: false, isError: false, data: [FREE, PAID], refetch: jest.fn() }),
  useMyPasses: () => ({ isError: false, data: [ACTIVE], refetch: jest.fn() }),
  useEarnings: () => ({ isError: false, data: { rides: 3, earned_paise: 15300, cash_collected_paise: 10200 } }),
}));

function statusWith(overrides: Record<string, unknown>) {
  return {
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
    data: { active_pass: null, queued_pass: null, ...overrides },
  };
}

async function renderWallet() {
  const { QueryClient, QueryClientProvider } = jest.requireActual("@tanstack/react-query");
  // No cache clean-up timers: they would keep the test worker alive after the run.
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: Infinity }, queries: { gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CaptainWallet />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockBuyPass.mockReset();
  mockCheckout.mockReset();
  mockStatus = statusWith({});
});

test("a free pass is active at once", async () => {
  mockBuyPass.mockResolvedValue({ ...ACTIVE, payment_attempt_id: null });
  const view = await renderWallet();

  await fireEvent.press(view.getByText("Launch pass · 1 day · Free"));

  await waitFor(() => expect(view.getByText("Your pass is active. You can go on duty.")).toBeTruthy());
  expect(mockBuyPass).toHaveBeenCalledWith("free");
  expect(mockCheckout).not.toHaveBeenCalled();
});

test("a paid pass opens Razorpay and waits for its confirmation", async () => {
  mockBuyPass.mockResolvedValue({ ...ACTIVE, status: "PENDING_ACTIVATION", payment_attempt_id: "pa-1" });
  mockCheckout.mockResolvedValue({ mode: "checkout", ended: "closed" });
  const view = await renderWallet();

  await fireEvent.press(view.getByText("Day pass · 1 day · ₹49"));

  await waitFor(() =>
    expect(view.getByText("Payment sent. Your pass turns on as soon as Razorpay confirms it.")).toBeTruthy(),
  );
  expect(mockCheckout).toHaveBeenCalledWith("pa-1");
});

test("a refusal is shown in plain words", async () => {
  const refusal = Object.assign(new Error("Your last pass payment is still going through."), {
    name: "ApiRequestError",
  });
  mockBuyPass.mockRejectedValue(refusal);
  const view = await renderWallet();

  await fireEvent.press(view.getByText("Launch pass · 1 day · Free"));

  await waitFor(() => expect(view.getByRole("alert")).toBeTruthy());
});

test("with an active pass, buying waits and a queued pass is shown", async () => {
  mockStatus = statusWith({ active_pass: ACTIVE, queued_pass: { ...ACTIVE, id: "q", plan: PAID, status: "QUEUED" } });
  const view = await renderWallet();

  expect(view.getByText("You can buy your next pass when this one ends.")).toBeTruthy();
  expect(view.queryByText("Day pass · 1 day · ₹49")).toBeNull();
  expect(view.getByText("Next: Day pass, starts when this one ends")).toBeTruthy();
  expect(view.getByText("3 rides · ₹102 collected")).toBeTruthy();
});

test("shows an error with a retry when the wallet cannot load", async () => {
  mockStatus = { isPending: false, isError: true, error: new Error("down"), refetch: jest.fn() };
  const view = await renderWallet();

  expect(view.getByText("We couldn't load your wallet")).toBeTruthy();
});
