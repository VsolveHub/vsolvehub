import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { useEffect } from "react";

import { ParcelDraftProvider, useParcelDraft } from "./draft";
import { emptyEnd, type ParcelEnd } from "./model";
import { ParcelReviewScreen } from "./ParcelReviewScreen";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockBook = jest.fn();
const mockFindOpenRide = jest.fn();
const mockQuoteRefetch = jest.fn();
const mockRulesRefetch = jest.fn();
let mockQuotes: Record<string, unknown>;
let mockRules: Record<string, unknown>;

class MockApiError extends Error {
  readonly api = true;
  constructor(
    readonly code: string,
    message = "",
  ) {
    super(message || code);
  }
}

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
  useLocalSearchParams: () => ({
    pickupLat: "17.440000",
    pickupLng: "78.350000",
    pickupLabel: "Gachibowli Stadium",
    dropLat: "17.450000",
    dropLng: "78.380000",
    dropLabel: "Hitec City",
    vehicle: "BIKE",
  }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@vsolve/api-client", () => ({
  ...jest.requireActual("@vsolve/api-client"),
  isApiRequestError: (error: unknown) => (error as { api?: boolean } | null)?.api === true,
}));
jest.mock("@/features/account/queries", () => ({
  useCustomerProfile: () => ({
    isError: false,
    data: { full_name: "Priya Sharma", display_name: "Priya", phone_number: "+919123456780" },
  }),
}));
jest.mock("../queries", () => ({
  useFareQuotes: () => mockQuotes,
  useAvailability: () => mockRules,
  bookParcel: (...args: unknown[]) => mockBook(...args),
  findOpenRide: () => mockFindOpenRide(),
}));

const QUOTES = [
  { id: "q-bike", vehicle_type: "BIKE", fare_paise: 5100, max_weight_grams: 10_000, size_label: "40 x 30 x 20 cm", distance_m: 4200, duration_s: 900 },
  { id: "q-auto", vehicle_type: "AUTO", fare_paise: 8100, max_weight_grams: 50_000, size_label: "1.3 x 3.5 x 3.3 ft", distance_m: 4200, duration_s: 900 },
];
const RECEIVER: ParcelEnd = { ...emptyEnd("drop"), name: "Asha Rao", phone: "9876543210", building: "Green Villas" };

/** Fills the drop end as if the details screen had been used. */
function Seed({ end }: { end: ParcelEnd }) {
  const { setEnd } = useParcelDraft();
  useEffect(() => setEnd("drop", end), [end, setEnd]);
  return null;
}

async function renderReview(end?: ParcelEnd) {
  const { QueryClient, QueryClientProvider } = jest.requireActual("@tanstack/react-query");
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ParcelDraftProvider>
        {end ? <Seed end={end} /> : null}
        <ParcelReviewScreen />
      </ParcelDraftProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const fn of [mockPush, mockBack, mockReplace, mockBook, mockFindOpenRide, mockQuoteRefetch, mockRulesRefetch]) fn.mockReset();
  mockQuotes = { isPending: false, isError: false, refetch: mockQuoteRefetch, data: { quotes: QUOTES } };
  mockRules = {
    isError: false,
    refetch: mockRulesRefetch,
    data: { parcel_rules: { value_cap_paise: 500_000, prohibited_items: ["Alcohol", "Live animals"] } },
  };
});

describe("what Review shows", () => {
  it("starts as sending, the booker at the pickup and the drop still to add", async () => {
    const view = await renderReview();

    expect(view.getByLabelText("I'm sending").props.accessibilityState.selected).toBe(true);
    expect(view.getByText("Priya Sharma")).toBeTruthy();
    expect(view.getByText("Add recipient details")).toBeTruthy();
    expect(view.getByText("Gachibowli Stadium")).toBeTruthy();
    expect(view.getByText("Hitec City")).toBeTruthy();
    expect(view.getByText("Meet at curb")).toBeTruthy();
    expect(view.getByText("Meet at door")).toBeTruthy();
    expect(view.getByText("Edit")).toBeTruthy(); // the booker's own end is already complete
    expect(view.getByText("Add")).toBeTruthy();
  });

  it("shows the chosen vehicle with its limits and a way to change it", async () => {
    const view = await renderReview();

    expect(view.getByText("Bike")).toBeTruthy();
    expect(view.getAllByText("Up to 10 kg · 40 x 30 x 20 cm").length).toBeGreaterThan(0);
    await fireEvent.press(view.getByText("Change"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("says who pays and where, with the server's fare, and Sender is the start", async () => {
    const view = await renderReview();

    expect(view.getByLabelText("Sender").props.accessibilityState.selected).toBe(true);
    expect(view.getByText("Sender pays ₹51 in cash or UPI to the captain at the pickup")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Receiver"));
    expect(view.getByText("Receiver pays ₹51 in cash or UPI to the captain at the drop")).toBeTruthy();
  });

  it("has PIN confirmation on by default", async () => {
    const view = await renderReview();

    expect(view.getByLabelText("PIN confirmation").props.value).toBe(true);
    expect(view.getByText("Add peace of mind? Turn on to confirm delivery with a 4-digit PIN.")).toBeTruthy();
  });

  it("shows the package guidelines from the server and the agreement above the button", async () => {
    const view = await renderReview();

    expect(view.getByText("Bike: Up to 10 kg · 40 x 30 x 20 cm")).toBeTruthy();
    expect(view.getByText("Auto: Up to 50 kg · 1.3 x 3.5 x 3.3 ft")).toBeTruthy();
    expect(view.getByText("₹5,000 or less in value")).toBeTruthy();
    expect(view.getByText("Securely sealed and ready for pickup")).toBeTruthy();
    expect(
      view.getByText(
        "By confirming, you agree your package follows these guidelines and is not on the prohibited list. Items are not insured.",
      ),
    ).toBeTruthy();
    expect(view.queryByRole("checkbox")).toBeNull(); // there is no tick box (D6)
  });

  it("opens the prohibited items the server sent", async () => {
    const view = await renderReview();

    await fireEvent.press(view.getByText("See prohibited items"));

    expect(await view.findByText("• Alcohol")).toBeTruthy();
    expect(view.getByText("• Live animals")).toBeTruthy();
  });

  it("says so, and offers a retry, when the prohibited list cannot be loaded", async () => {
    mockRules = { isError: true, error: new Error("offline"), refetch: mockRulesRefetch, data: undefined };
    const view = await renderReview();

    await fireEvent.press(view.getByText("See prohibited items"));
    await fireEvent.press(await view.findByText("Try again"));

    expect(mockRulesRefetch).toHaveBeenCalled();
  });
});

describe("sending or receiving, and who pays (D7, D9)", () => {
  it("moves the booker's details to the drop when receiving, and the payer follows", async () => {
    const view = await renderReview();

    await fireEvent.press(view.getByLabelText("I'm receiving"));

    expect(view.getByText("Add sender details")).toBeTruthy();
    expect(view.getByText("Priya Sharma")).toBeTruthy(); // now the drop
    expect(view.getByText("Receiver pays ₹51 in cash or UPI to the captain at the drop")).toBeTruthy();
  });

  it("keeps the payer the booker chose, whatever they toggle after", async () => {
    const view = await renderReview();

    await fireEvent.press(view.getByLabelText("Receiver"));
    await fireEvent.press(view.getByLabelText("I'm receiving"));
    await fireEvent.press(view.getByLabelText("I'm sending"));

    expect(view.getByText("Receiver pays ₹51 in cash or UPI to the captain at the drop")).toBeTruthy();
  });

  it("opens the details screen for the end that was tapped", async () => {
    const view = await renderReview();

    await fireEvent.press(view.getByText("Add"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/rides/parcel/contact",
      params: { side: "drop", address: "Hitec City" },
    });
  });
});

describe("Confirm (D8)", () => {
  it("carries the fare and stays off until both ends have a name and phone", async () => {
    const view = await renderReview();

    expect(view.getByText("Confirm Pick up & Drop · ₹51")).toBeTruthy();
    await fireEvent.press(view.getByText("Confirm Pick up & Drop · ₹51"));
    expect(mockBook).not.toHaveBeenCalled();
  });

  it("books the parcel with both ends and every choice, then opens the tracking screen", async () => {
    mockBook.mockResolvedValue({ id: "ride-1" });
    const view = await renderReview(RECEIVER);

    await fireEvent.press(view.getByLabelText("Receiver"));
    await fireEvent(view.getByLabelText("PIN confirmation"), "valueChange", false);
    await fireEvent.press(view.getByText("Confirm Pick up & Drop · ₹51"));

    await waitFor(() => expect(mockBook).toHaveBeenCalled());
    const [quoteId, parcel] = mockBook.mock.calls[0] as [string, Record<string, unknown>];
    expect(quoteId).toBe("q-bike");
    expect(parcel).toMatchObject({
      mode: "SEND",
      payer: "RECEIVER",
      pin_required: false,
      pickup: { name: "Priya Sharma", phone: "9123456780", meet_at: "CURB" },
      drop: { name: "Asha Rao", phone: "9876543210", building: "Green Villas", meet_at: "DOOR" },
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/rides/ride/ride-1"));
  });

  it("asks for fresh prices when the quote has expired", async () => {
    mockBook.mockRejectedValue(new MockApiError("quote_expired"));
    const view = await renderReview(RECEIVER);

    await fireEvent.press(view.getByText("Confirm Pick up & Drop · ₹51"));

    expect(await view.findByText("The price changed. Check the new price and confirm again.")).toBeTruthy();
    expect(mockQuoteRefetch).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("takes the customer to the parcel already going", async () => {
    mockBook.mockRejectedValue(new MockApiError("ride_already_open"));
    mockFindOpenRide.mockResolvedValue("ride-9");
    const view = await renderReview(RECEIVER);

    await fireEvent.press(view.getByText("Confirm Pick up & Drop · ₹51"));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/rides/ride/ride-9"));
  });

  it("shows an honest message for any other refusal, never a blank one", async () => {
    mockBook.mockRejectedValue(new MockApiError("parcel_details_required", "Add a name and phone number for the pickup and the drop."));
    const view = await renderReview(RECEIVER);

    await fireEvent.press(view.getByText("Confirm Pick up & Drop · ₹51"));

    // The app's own wording for the error, from describeError, is what the customer sees.
    expect(await view.findByRole("alert")).toBeTruthy();
    expect(view.queryByText("Confirm Pick up & Drop · ₹51")).toBeTruthy();
  });
});

describe("when the prices cannot be shown", () => {
  it("shows a loading state, an error with a retry, and a missing vehicle", async () => {
    mockQuotes = { isPending: true, isError: false, refetch: mockQuoteRefetch, data: undefined };
    expect((await renderReview()).getByText("Getting prices…")).toBeTruthy();

    mockQuotes = { isPending: false, isError: true, error: new Error("offline"), refetch: mockQuoteRefetch, data: undefined };
    const failed = await renderReview();
    await fireEvent.press(failed.getByText("Try again"));
    expect(mockQuoteRefetch).toHaveBeenCalled();

    mockQuotes = { isPending: false, isError: false, refetch: mockQuoteRefetch, data: { quotes: [QUOTES[1]] } };
    expect((await renderReview()).getByText("This vehicle isn't available for this trip. Go back and choose another.")).toBeTruthy();
  });
});
