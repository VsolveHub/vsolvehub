import { fireEvent, render } from "@testing-library/react-native";

import { canEditVehicle, vehicleProblems, EMPTY_VEHICLE } from "../model/vehicle";
import { CaptainHome } from "./captain-home";
import { RideHistory } from "./ride-history";
import { VehicleScreen } from "./vehicle-screen";

const mockPush = jest.fn();
const mockSave = jest.fn();
const mockOffDuty = jest.fn();
let mockStatus: Record<string, unknown>;
let mockHistory: Record<string, unknown>;
let mockRide: Record<string, unknown> | null = null;

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual("@tanstack/react-query"),
  useQuery: () => ({ data: { rides: 2, earned_paise: 10200 }, isError: false }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useMutation: () => ({ mutate: mockOffDuty, isPending: false, isError: false }),
}));
jest.mock("../duty", () => ({ goOffDuty: jest.fn() }));
jest.mock("../queries", () => ({
  useCaptainStatus: () => mockStatus,
  useSaveVehicle: () => ({ mutate: mockSave, isPending: false, isError: false }),
  useCaptainHistory: () => mockHistory,
  useCurrentRide: () => ({ data: { ride: mockRide } }),
}));

const APPROVED = {
  approval: "APPROVED",
  is_approved: true,
  vehicle: { vehicle_type: "BIKE", registration_number: "TS09AB1234", make_model: "Honda Shine", colour: "Black" },
  active_pass: null,
  queued_pass: null,
  on_duty: false,
  duty_started_at: null,
  blocked_reasons: ["pass_required"],
  server_now: "2026-11-11T10:00:00+05:30",
  last_duty_end: null,
};

beforeEach(() => {
  mockRide = null;
  mockOffDuty.mockClear();
  mockPush.mockClear();
  mockSave.mockClear();
  mockStatus = { isPending: false, isError: false, data: APPROVED, refetch: jest.fn() };
  mockHistory = { isPending: false, isError: false, data: { results: [] }, refetch: jest.fn() };
});

describe("vehicle rules", () => {
  it("can change only while the application is a draft or sent back", () => {
    expect(canEditVehicle("DRAFT")).toBe(true);
    expect(canEditVehicle("CHANGES_REQUIRED")).toBe(true);
    expect(canEditVehicle("SUBMITTED")).toBe(false);
    expect(canEditVehicle("APPROVED")).toBe(false);
  });

  it("asks for every field", () => {
    expect(Object.keys(vehicleProblems(EMPTY_VEHICLE)).sort()).toEqual(
      ["colour", "make_model", "registration_number", "vehicle_type"].sort(),
    );
    expect(
      vehicleProblems({ vehicle_type: "AUTO", registration_number: "ts 09 ab 1", make_model: "Bajaj RE", colour: "Green" }),
    ).toEqual({});
  });
});

describe("VehicleScreen", () => {
  it("shows a loading state, then an error with a retry", async () => {
    mockStatus = { isPending: true };
    expect((await render(<VehicleScreen />)).queryByText("Vehicle type")).toBeNull();

    mockStatus = { isPending: false, isError: true, error: new Error("down"), refetch: jest.fn() };
    expect((await render(<VehicleScreen />)).getByText("We couldn't load your details")).toBeTruthy();
  });

  it("saves a complete vehicle from a draft and refuses an incomplete one", async () => {
    mockStatus = { isPending: false, isError: false, data: { ...APPROVED, approval: "DRAFT", vehicle: null } };
    const view = await render(<VehicleScreen />);

    await fireEvent.press(view.getByText("Save and continue"));
    expect(mockSave).not.toHaveBeenCalled();
    expect(view.getByText("Choose your vehicle type.")).toBeTruthy();

    await fireEvent.press(view.getByText("Auto"));
    await fireEvent.changeText(view.getByPlaceholderText("TS 09 AB 1234"), "TS 09 ZZ 7");
    await fireEvent.changeText(view.getByPlaceholderText("Honda Shine"), "Bajaj RE");
    await fireEvent.changeText(view.getByPlaceholderText("Black"), "Green");
    await fireEvent.press(view.getByText("Save and continue"));

    expect(mockSave).toHaveBeenCalledWith(
      { vehicle_type: "AUTO", registration_number: "TS 09 ZZ 7", make_model: "Bajaj RE", colour: "Green" },
      expect.anything(),
    );
  });

  it("is read-only once the application is sent", async () => {
    mockStatus = { isPending: false, isError: false, data: { ...APPROVED, approval: "SUBMITTED" } };
    const view = await render(<VehicleScreen />);

    expect(view.getByText(/can't be changed while your application is being reviewed/)).toBeTruthy();
    expect(view.queryByText("Save and continue")).toBeNull();
  });
});

describe("CaptainHome", () => {
  it("says why duty is blocked and shows the vehicle and today's money", async () => {
    const view = await render(<CaptainHome />);

    expect(view.getByText("You're off duty")).toBeTruthy();
    expect(view.getByText("Buy a pass in Wallet to go on duty.")).toBeTruthy();
    expect(view.getByText(/TS09AB1234/)).toBeTruthy();
    expect(view.getByText("2 rides")).toBeTruthy();
  });

  it("shows an error with a retry", async () => {
    mockStatus = { isPending: false, isError: true, error: new Error("down"), refetch: jest.fn() };
    expect((await render(<CaptainHome />)).getByText("We couldn't load your captain details")).toBeTruthy();
  });

  it("opens the duty steps when nothing blocks duty", async () => {
    mockStatus = { isPending: false, isError: false, data: { ...APPROVED, blocked_reasons: [] } };
    const view = await render(<CaptainHome />);

    await fireEvent.press(view.getByText("Go on duty"));

    expect(mockPush).toHaveBeenCalledWith("/rides/duty-setup");
  });

  it("offers Go off duty while on duty", async () => {
    mockStatus = { isPending: false, isError: false, data: { ...APPROVED, on_duty: true, blocked_reasons: [] } };
    const view = await render(<CaptainHome />);

    await fireEvent.press(view.getByText("Go off duty"));

    expect(view.getByText("You're on duty")).toBeTruthy();
    expect(mockOffDuty).toHaveBeenCalled();
  });

  it("shows the accepted ride with the rider to call", async () => {
    mockRide = {
      state: "CAPTAIN_ASSIGNED",
      pickup: { address: "Gachibowli Stadium" },
      drop: { address: "Hitec City" },
      fare_paise: 5100,
      rider: { name: "Priya", phone_number: "+919999900000" },
    };
    const view = await render(<CaptainHome />);

    expect(view.getByText("Go to the pickup")).toBeTruthy();
    expect(view.getByText("Pickup: Gachibowli Stadium")).toBeTruthy();
    expect(view.getByText("Call rider")).toBeTruthy();
  });

  it("says why the server ended duty", async () => {
    mockStatus = {
      isPending: false,
      isError: false,
      data: { ...APPROVED, last_duty_end: { reason: "LOCATION_STALE", ended_at: "2026-11-11T09:00:00Z" } },
    };
    const view = await render(<CaptainHome />);

    expect(view.getByText("You went off duty: we lost your location for 2 minutes.")).toBeTruthy();
  });
});

describe("RideHistory", () => {
  it("shows an empty state, then rides", async () => {
    expect((await render(<RideHistory />)).getByText("No rides yet")).toBeTruthy();

    mockHistory = {
      isPending: false,
      isError: false,
      refetch: jest.fn(),
      data: {
        results: [
          {
            id: "r1",
            state: "COMPLETED",
            vehicle_type: "BIKE",
            pickup_address: "Gachibowli",
            drop_address: "Hitec City",
            fare_paise: 5100,
            final_fare_paise: 5400,
            payment_status: "COLLECTED",
            created_at: "2026-11-11T09:00:00+05:30",
            completed_at: "2026-11-11T09:30:00+05:30",
            cancelled_by: "",
          },
        ],
      },
    };
    const view = await render(<RideHistory />);
    expect(view.getByText("Completed")).toBeTruthy();
    expect(view.getByText("Gachibowli → Hitec City")).toBeTruthy();
  });
});
