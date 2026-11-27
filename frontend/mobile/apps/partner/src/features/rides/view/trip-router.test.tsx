import { render } from "@testing-library/react-native";
import { TripRouter } from "./trip-router";

let mockRide: Record<string, unknown> | null;

jest.mock("../queries", () => ({ useCurrentRide: () => ({ data: { ride: mockRide } }) }));
jest.mock("./parcel-trip-screen", () => ({
  ParcelTripScreen: () =>
    jest.requireActual("react").createElement(jest.requireActual("react-native").Text, null, "parcel screen"),
}));
jest.mock("./trip-screen", () => ({
  TripScreen: () =>
    jest.requireActual("react").createElement(jest.requireActual("react-native").Text, null, "ride screen"),
}));

test("a ride gets the ride screen", async () => {
  mockRide = { id: "r1", kind: "RIDE" };

  expect((await render(<TripRouter />)).getByText("ride screen")).toBeTruthy();
});

test("a parcel gets the parcel screen", async () => {
  mockRide = { id: "p1", kind: "PARCEL" };

  expect((await render(<TripRouter />)).getByText("parcel screen")).toBeTruthy();
});

test("a parcel keeps its screen after the server stops returning it, for the summary", async () => {
  mockRide = { id: "p1", kind: "PARCEL" };
  const view = await render(<TripRouter />);

  mockRide = null;
  await view.rerender(<TripRouter />);

  expect(view.getByText("parcel screen")).toBeTruthy();
});

test("with no ride at all, the ride screen explains there is none", async () => {
  mockRide = null;

  expect((await render(<TripRouter />)).getByText("ride screen")).toBeTruthy();
});
