import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { ParcelPreferenceCard } from "./parcel-preference-card";

const mockSet = jest.fn();

jest.mock("../queries", () => ({
  captainStatusKey: ["rides", "me"],
  setParcelPreference: (value: boolean) => mockSet(value),
}));

function status(vehicleType: string | null, takesParcels: boolean) {
  return {
    vehicle: vehicleType ? { vehicle_type: vehicleType, registration_number: "TS09AB1234" } : null,
    takes_parcels: takesParcels,
  };
}

async function renderCard(value: unknown) {
  const { QueryClient, QueryClientProvider } = jest.requireActual("@tanstack/react-query");
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } });
  client.setQueryData(["rides", "me"], value);
  const view = await render(
    <QueryClientProvider client={client}>
      <ParcelPreferenceCard status={value as never} />
    </QueryClientProvider>,
  );
  return Object.assign(view, { client });
}

beforeEach(() => mockSet.mockReset());

test("shows the switch for a bike captain, on by default", async () => {
  const view = await renderCard(status("BIKE", true));

  expect(view.getByText("Take parcel orders")).toBeTruthy();
  expect(view.getByLabelText("Take parcel orders").props.value).toBe(true);
});

test("shows it for an auto captain too, and reflects an off setting", async () => {
  const view = await renderCard(status("AUTO", false));

  expect(view.getByLabelText("Take parcel orders").props.value).toBe(false);
});

test("is not there for a cab captain, or with no vehicle", async () => {
  expect((await renderCard(status("CAB", false))).queryByText("Take parcel orders")).toBeNull();
  expect((await renderCard(status(null, false))).queryByText("Take parcel orders")).toBeNull();
});

test("turning it off tells the server, and shows the new value while it is on its way", async () => {
  mockSet.mockReturnValue(new Promise(() => undefined)); // the answer has not come yet
  const view = await renderCard(status("BIKE", true));

  await fireEvent(view.getByLabelText("Take parcel orders"), "valueChange", false);

  await waitFor(() => expect(mockSet).toHaveBeenCalledWith(false));
  expect(view.getByLabelText("Take parcel orders").props.value).toBe(false);
});

test("keeps the captain's status up to date once the server answers", async () => {
  mockSet.mockResolvedValue({ takes_parcels: false });
  const view = await renderCard(status("BIKE", true));

  await fireEvent(view.getByLabelText("Take parcel orders"), "valueChange", false);

  await waitFor(() =>
    expect((view.client.getQueryData(["rides", "me"]) as { takes_parcels: boolean }).takes_parcels).toBe(false),
  );
});

test("says why when the server refuses", async () => {
  mockSet.mockRejectedValue(new Error("Pick up and Drop is for bike and auto captains."));
  const view = await renderCard(status("BIKE", true));

  await fireEvent(view.getByLabelText("Take parcel orders"), "valueChange", false);

  expect(await view.findByRole("alert")).toBeTruthy();
});
