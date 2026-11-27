import { fireEvent, render } from "@testing-library/react-native";
import { Text } from "@vsolve/mobile-ui";
import { useEffect } from "react";

import { ParcelDraftProvider, useParcelDraft } from "./draft";
import { ParcelContactScreen } from "./ParcelContactScreen";

const mockBack = jest.fn();
let mockParams: Record<string, string>;
let mockSaved: unknown;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/features/account/queries", () => ({
  useCustomerProfile: () => ({
    isError: false,
    data: { full_name: "Priya Sharma", display_name: "Priya", phone_number: "+919123456780" },
  }),
}));

/** Shows what the draft holds, so a test can see what Save and continue stored. */
function Probe() {
  const { draft } = useParcelDraft();
  useEffect(() => {
    mockSaved = draft;
  });
  return <Text>draft</Text>;
}

async function renderContact() {
  return render(
    <ParcelDraftProvider>
      <Probe />
      <ParcelContactScreen />
    </ParcelDraftProvider>,
  );
}

beforeEach(() => {
  mockBack.mockClear();
  mockParams = { side: "drop", address: "Hitec City" };
  mockSaved = null;
});

describe("the heading and the address", () => {
  it("asks who is receiving at the drop, and shows the address", async () => {
    const view = await renderContact();

    expect(view.getByText("Who's receiving the package?")).toBeTruthy();
    expect(view.getByText("Hitec City")).toBeTruthy();
    expect(view.getByText("Dropoff options")).toBeTruthy();
  });

  it("asks who is sending at the pickup, with the booker already filled in", async () => {
    mockParams = { side: "pickup", address: "Gachibowli Stadium" };
    const view = await renderContact();

    expect(view.getByText("Who's sending the package?")).toBeTruthy();
    expect(view.getByLabelText(/^Name/).props.value).toBe("Priya Sharma");
    expect(view.getByLabelText(/^Phone number/).props.value).toBe("9123456780");
    expect(view.getByText("Pickup options")).toBeTruthy();
  });
});

describe("Save and continue (D8)", () => {
  it("needs a name and a 10-digit phone", async () => {
    const view = await renderContact();
    await fireEvent.press(view.getByText("Save and continue"));
    expect(mockBack).not.toHaveBeenCalled(); // empty

    await fireEvent.changeText(view.getByLabelText(/^Name/), "Asha Rao");
    await fireEvent.press(view.getByText("Save and continue"));
    expect(mockBack).not.toHaveBeenCalled(); // no phone yet

    await fireEvent.changeText(view.getByLabelText(/^Phone number/), "98765");
    await fireEvent.press(view.getByText("Save and continue"));
    expect(mockBack).not.toHaveBeenCalled(); // too short
  });

  it("says what is wrong with a short phone, and keeps only digits", async () => {
    const view = await renderContact();

    await fireEvent.changeText(view.getByLabelText(/^Phone number/), "98a76 5");

    expect(view.getByLabelText(/^Phone number/).props.value).toBe("98765");
    expect(view.getByText("Enter a 10-digit mobile number.")).toBeTruthy();
  });

  it("never lets the phone run past 10 digits", async () => {
    const view = await renderContact();

    await fireEvent.changeText(view.getByLabelText(/^Phone number/), "987654321012345");

    expect(view.getByLabelText(/^Phone number/).props.value).toBe("9876543210");
  });

  it("saves everything, trimmed, into the draft and goes back to Review", async () => {
    const view = await renderContact();

    await fireEvent.changeText(view.getByLabelText(/^Name/), "  Asha Rao ");
    await fireEvent.changeText(view.getByLabelText(/^Phone number/), "9876543210");
    await fireEvent.changeText(view.getByLabelText(/^Store or building name/), " Green Villas ");
    await fireEvent.changeText(view.getByLabelText(/^Unit\/floor/), "2nd floor");
    await fireEvent.press(view.getByLabelText("Meet at curb"));
    await fireEvent.changeText(view.getByLabelText(/^Instructions for the captain/), " Ring twice ");
    await fireEvent.press(view.getByText("Save and continue"));

    expect(mockBack).toHaveBeenCalled();
    expect((mockSaved as { drop: unknown }).drop).toEqual({
      name: "Asha Rao",
      phone: "9876543210",
      building: "Green Villas",
      unit: "2nd floor",
      meet_at: "CURB",
      instructions: "Ring twice",
    });
  });

  it("starts the drop meeting at the door, and the pickup at the curb", async () => {
    const drop = await renderContact();
    expect(drop.getByLabelText("Meet at door").props.accessibilityState.selected).toBe(true);

    mockParams = { side: "pickup" };
    const pickup = await renderContact();
    expect(pickup.getByLabelText("Meet at curb").props.accessibilityState.selected).toBe(true);
  });

  it("stops the instructions at 120 characters and counts them", async () => {
    const view = await renderContact();

    expect(view.getByLabelText(/^Instructions for the captain/).props.maxLength).toBe(120);
    await fireEvent.changeText(view.getByLabelText(/^Instructions for the captain/), "Ring twice");

    expect(view.getByText("10/120")).toBeTruthy();
  });
});
