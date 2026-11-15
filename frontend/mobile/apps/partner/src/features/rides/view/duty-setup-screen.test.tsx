import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { DutySetupScreen } from "./duty-setup-screen";

const mockReplace = jest.fn();
const mockGoOnDuty = jest.fn();
const mockEnablePush = jest.fn();
let mockPushPermission = "granted";
const mockStore: Record<string, string> = {};
let mockPermission: { granted: boolean; canAskAgain: boolean; android?: { accuracy: string } };

jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }) }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));
jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: async () => mockPermission,
  requestForegroundPermissionsAsync: jest.fn(async () => mockPermission),
}));
jest.mock("expo-device", () => ({ manufacturer: "realme" }));
jest.mock("expo-intent-launcher", () => ({ startActivityAsync: jest.fn(), ActivityAction: {} }));
jest.mock("@vsolve/mobile-core", () => ({
  kvGet: async (key: string) => mockStore[key] ?? null,
  kvSet: async (key: string, value: string) => {
    mockStore[key] = value;
  },
  pushPermission: async () => mockPushPermission,
  enablePush: () => mockEnablePush(),
}));
jest.mock("../duty", () => ({
  START_FAILED_MESSAGE: "Couldn't start location. Try again.",
  goOnDuty: () => mockGoOnDuty(),
}));
jest.mock("../queries", () => ({ captainStatusKey: ["rides", "me"] }));

beforeEach(() => {
  mockReplace.mockClear();
  mockGoOnDuty.mockReset().mockResolvedValue(undefined);
  mockEnablePush.mockReset().mockResolvedValue("granted");
  mockPushPermission = "granted";
  for (const key of Object.keys(mockStore)) delete mockStore[key];
  mockPermission = { granted: true, canAskAgain: true, android: { accuracy: "fine" } };
});

test("shows the location disclosure first, before any permission is asked", async () => {
  const view = await render(<DutySetupScreen />);

  expect(await view.findByText("How VSolve uses your location")).toBeTruthy();
  expect(view.getByText(/even when the app is closed or not in use/)).toBeTruthy();

  await fireEvent.press(view.getByText("Continue"));
  expect(mockStore["rides.disclosureSeen"]).toBe("1");
});

test("blocks duty on Approximate location until Precise is on", async () => {
  mockStore["rides.disclosureSeen"] = "1";
  mockPermission = { granted: true, canAskAgain: true, android: { accuracy: "coarse" } };

  const view = await render(<DutySetupScreen />);

  expect(await view.findByText("Turn on precise location")).toBeTruthy();
  expect(mockGoOnDuty).not.toHaveBeenCalled();
});

test("goes on duty by itself once nothing is missing", async () => {
  Object.assign(mockStore, {
    "rides.disclosureSeen": "1",
    "rides.notificationsAsked": "1",
    "rides.batterySeen": "1",
  });

  await render(<DutySetupScreen />);

  await waitFor(() => expect(mockGoOnDuty).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/rides"));
});

test("says so honestly when location cannot start", async () => {
  Object.assign(mockStore, {
    "rides.disclosureSeen": "1",
    "rides.notificationsAsked": "1",
    "rides.batterySeen": "1",
  });
  mockGoOnDuty.mockRejectedValue(new Error("Couldn't start location. Try again."));

  const view = await render(<DutySetupScreen />);

  expect(await view.findByText("Couldn't start location. Try again.")).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
});

test("asks for ride alerts with Android's own pop-up only, then goes on", async () => {
  Object.assign(mockStore, { "rides.disclosureSeen": "1", "rides.batterySeen": "1" });
  mockPushPermission = "undetermined"; // never asked on this phone

  const view = await render(<DutySetupScreen />);

  await waitFor(() => expect(mockGoOnDuty).toHaveBeenCalledTimes(1));
  expect(mockEnablePush).toHaveBeenCalledTimes(1); // the system pop-up, once
  expect(mockStore["rides.notificationsAsked"]).toBe("1");
  expect(view.queryByText("Allow ride alerts")).toBeNull(); // no page of our own before it
});

test("a refused alert pop-up never blocks duty", async () => {
  Object.assign(mockStore, { "rides.disclosureSeen": "1", "rides.batterySeen": "1" });
  mockPushPermission = "undetermined"; // never asked on this phone
  mockEnablePush.mockRejectedValue(new Error("denied"));

  await render(<DutySetupScreen />);

  await waitFor(() => expect(mockGoOnDuty).toHaveBeenCalledTimes(1));
  expect(mockStore["rides.notificationsAsked"]).toBe("1");
});

test("battery help is a sheet over the setup, shown once, then duty starts", async () => {
  Object.assign(mockStore, { "rides.disclosureSeen": "1", "rides.notificationsAsked": "1" });

  const view = await render(<DutySetupScreen />);

  expect(await view.findByText("Keep VSolve running")).toBeTruthy();
  expect(view.getByText(/Allow background activity/)).toBeTruthy(); // realme's own steps
  expect(mockGoOnDuty).not.toHaveBeenCalled();

  await fireEvent.press(view.getByText("Done, go on duty"));

  await waitFor(() => expect(mockGoOnDuty).toHaveBeenCalledTimes(1));
  expect(mockStore["rides.batterySeen"]).toBe("1");
});
