import { render } from "@testing-library/react-native";

import { useOfferWatch } from "./use-offer-watch";

const mockPush = jest.fn();
let mockOnDuty = true;
let mockOfferId: string | null = null;
let mockOfferedAt = "2026-11-11T10:00:00Z";
const mockPolling: boolean[] = [];

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("./queries", () => ({
  useCaptainStatus: () => ({ data: { on_duty: mockOnDuty } }),
  useCurrentOffer: (enabled: boolean) => {
    mockPolling.push(enabled);
    return { data: { offer: mockOfferId ? { id: mockOfferId, offered_at: mockOfferedAt } : null } };
  },
}));

function Watcher() {
  useOfferWatch();
  return null;
}

beforeEach(() => {
  mockPush.mockClear();
  mockPolling.length = 0;
  mockOnDuty = true;
  mockOfferId = null;
  mockOfferedAt = "2026-11-11T10:00:00Z";
});

test("opens each new request once", async () => {
  const view = await render(<Watcher />);
  expect(mockPush).not.toHaveBeenCalled();

  mockOfferId = "offer-1";
  await view.rerender(<Watcher />);
  await view.rerender(<Watcher />);
  mockOfferId = "offer-2";
  await view.rerender(<Watcher />);

  expect(mockPush.mock.calls).toEqual([["/rides/offer/offer-1"], ["/rides/offer/offer-2"]]);
});

test("rings again when the same request comes back after another captain cancels", async () => {
  mockOfferId = "offer-1";
  const view = await render(<Watcher />);

  mockOfferId = null; // declined; another captain took it
  await view.rerender(<Watcher />);
  mockOfferId = "offer-1"; // that captain cancelled: the server re-sends the same offer
  mockOfferedAt = "2026-11-11T10:03:00Z";
  await view.rerender(<Watcher />);

  expect(mockPush.mock.calls).toEqual([["/rides/offer/offer-1"], ["/rides/offer/offer-1"]]);
});

test("does not look for requests while off duty", async () => {
  mockOnDuty = false;
  await render(<Watcher />);
  expect(mockPolling.every((enabled) => !enabled)).toBe(true);
});
