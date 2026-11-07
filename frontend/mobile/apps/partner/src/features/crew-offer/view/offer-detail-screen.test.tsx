import { ApiRequestError } from "@vsolve/api-client";
import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { OfferDetailScreen } from "./offer-detail-screen";

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const mockOffer = {
  invitation_id: "invite-1",
  requirement_id: "req-1",
  status: "INVITED" as const,
  decline_reason_code: "",
  headcount: 2,
  days: 1,
  lead_day_receipt_paise: 180_000,
  lead_total_receipt_paise: 180_000,
  standard_day_hours: 8,
  overtime_hourly_paise: 0,
  inclusions: [],
  responds_by: "2099-01-01T00:00:00Z",
  verified_roster_size: 4,
  requested_start: "2099-01-02T00:00:00Z",
  area_label: "Kondapur",
  brief: [],
  crew_mix: [],
  server_now: "2026-10-01T00:00:00Z",
};

const mockBooking = {
  booking_id: "book-1",
  requirement_id: "req-1",
  status: "CONFIRMED" as const,
  headcount: 2,
  days: 1,
  lead_day_receipt_paise: 180_000,
  lead_receipt_paise: 180_000,
  standard_day_hours: 8,
  overtime_hourly_paise: 0,
  add_on_rates: {},
  inclusions: [],
  hold_expires_at: null,
  requested_start: "2099-01-02T00:00:00Z",
  brief: [],
  crew_mix: [],
  server_now: "2026-10-01T00:00:00Z",
};

const mockAccept = {
  isPending: false,
  error: null as unknown,
};

jest.mock("@vsolve/query/native", () => ({
  describeError: (error: unknown) => ({
    message: error instanceof Error ? error.message : "Something went wrong",
  }),
  hasWorkspaceAction: () => false,
  useServerCountdown: (deadline: string | null) =>
    deadline ? { display: "1:59", isExpired: false, announce: "" } : null,
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/features/workspace/queries", () => ({
  usePartnerWorkspaceGrants: () => ({ grants: [] }),
}));

jest.mock("../queries", () => ({
  usePartnerCrewOffers: () => ({
    data: { offers: [mockOffer], server_now: mockOffer.server_now },
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useAcceptCrewOffer: (_id: string, options: { onAccepted?: (booking: typeof mockBooking) => void }) => ({
    isPending: mockAccept.isPending,
    error: mockAccept.error,
    mutate: () => options.onAccepted?.(mockBooking),
  }),
  useDeclineCrewOffer: () => ({ isPending: false, error: null, mutate: jest.fn() }),
}));

function renderScreen(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>);
}

function tap(element: { props: { onClick?: (event: object) => void; onPress?: () => void } }) {
  if (element.props.onClick) {
    element.props.onClick({
      nativeEvent: {},
      currentTarget: 1,
      target: 1,
      stopPropagation() {},
    });
    return;
  }
  element.props.onPress?.();
}

test("accept shows the confirmed outcome", async () => {
  mockAccept.isPending = false;
  mockAccept.error = null;
  const view = await renderScreen(<OfferDetailScreen invitationId="invite-1" />);
  tap(view.getByRole("button", { name: "Take it" }));
  tap(await view.findByRole("button", { name: "Yes, send them" }));
  expect(await view.findByText("Open it from Work when you're ready.")).toBeTruthy();
});

test("accept shows the pending label and the error", async () => {
  mockAccept.isPending = true;
  mockAccept.error = new ApiRequestError(409, {
    code: "offer_gone",
    message: "This offer was taken.",
    details: {},
    retryable: false,
    request_id: "req-1",
  });
  const view = await renderScreen(<OfferDetailScreen invitationId="invite-1" />);
  expect(view.getByRole("button", { name: "Taking it" })).toBeTruthy();
  expect(view.getByText(/This offer was taken/)).toBeTruthy();
  mockAccept.isPending = false;
  mockAccept.error = null;
});
