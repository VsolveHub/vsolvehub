import { act, fireEvent, render } from "@testing-library/react-native";
import { Platform } from "react-native";

import { ProfileMenuSheet } from "./profile-menu-sheet";

const mockPush = jest.fn();
const mockSignOut = jest.fn(() => Promise.resolve());

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));
jest.mock("@vsolve/mobile-core", () => ({
  useMobileLogout: () => mockSignOut,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

async function open(props: Partial<React.ComponentProps<typeof ProfileMenuSheet>> = {}) {
  const onClose = jest.fn();
  const view = await render(
    <ProfileMenuSheet visible onClose={onClose} partnerName="Rajesh" partnerInitial="R" {...props} />,
  );
  return { ...view, onClose };
}

async function settle() {
  await act(async () => {
    jest.runAllTimers();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.replaceProperty(Platform, "OS", "ios");
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("ProfileMenuSheet (applicant menu)", () => {
  it.each([
    ["Profile", "/apply/about"],
    ["Application status", "/apply/status"],
  ]) ("%s closes the sheet and opens %s, a route an applicant can open", async (label, route) => {
    const { getByLabelText, onClose } = await open();
    await fireEvent.press(getByLabelText(label));
    expect(onClose).toHaveBeenCalledTimes(1);
    await settle();
    expect(mockPush).toHaveBeenCalledWith(route);
  });

  it("opens the Need help sheet in place instead of leaving the page", async () => {
    const onOpenHelp = jest.fn();
    const { getByLabelText, onClose } = await open({ onOpenHelp });
    await fireEvent.press(getByLabelText("Help & support"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    await settle();
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("opens the delete confirmation in place instead of leaving the page", async () => {
    const onOpenDelete = jest.fn();
    const { getByLabelText, onClose } = await open({ onOpenDelete });
    await fireEvent.press(getByLabelText("Delete account"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    await settle();
    expect(onOpenDelete).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("falls back to the delete page when no dialog is provided", async () => {
    const { getByLabelText } = await open();
    await fireEvent.press(getByLabelText("Delete account"));
    await settle();
    expect(mockPush).toHaveBeenCalledWith("/delete-account");
  });

  it("says so when a deletion has already been requested", async () => {
    const { queryByText } = await open({ deletionNote: "Deletion requested on 12 Nov 2026. We'll contact you." });
    expect(queryByText("Deletion requested on 12 Nov 2026. We'll contact you.")).toBeTruthy();
  });

  it("shows no deletion note when nothing was requested", async () => {
    const { queryByText } = await open();
    expect(queryByText(/Deletion requested/)).toBeNull();
  });

  it("falls back to the help page when no sheet is provided", async () => {
    const { getByLabelText } = await open();
    await fireEvent.press(getByLabelText("Help & support"));
    await settle();
    expect(mockPush).toHaveBeenCalledWith("/help");
  });

  it("does not navigate while the sheet is still dismissing on iOS", async () => {
    // Regression: a native push made during the Modal's dismissal is dropped by iOS, so "Help &
    // support" and "Delete account" did nothing when tapped.
    const { getByLabelText } = await open();
    await fireEvent.press(getByLabelText("Help & support"));
    expect(mockPush).not.toHaveBeenCalled();
    await settle();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("navigates at once on Android, which has no such limit", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const { getByLabelText } = await open();
    await fireEvent.press(getByLabelText("Delete account"));
    expect(mockPush).toHaveBeenCalledWith("/delete-account");
  });

  it("shows the first letter of a real name", async () => {
    const { queryByText } = await open({ partnerName: "Rajesh", partnerInitial: "R" });
    expect(queryByText("Rajesh")).toBeTruthy();
    expect(queryByText("R")).toBeTruthy();
  });

  it("shows no made-up letter when there is no name yet", async () => {
    // Regression: the avatar fell back to "R", and the label "Your account" gave a "Y".
    const { queryByText } = await open({ partnerName: undefined, partnerInitial: "" });
    expect(queryByText("Your account")).toBeTruthy();
    expect(queryByText("Y")).toBeNull();
    expect(queryByText("R")).toBeNull();
  });

  it("never sends an applicant to the partner-only /me pages", async () => {
    const { getByLabelText } = await open();
    for (const label of ["Profile", "Application status", "Help & support", "Delete account"]) {
      await fireEvent.press(getByLabelText(label));
    }
    await settle();
    expect(mockPush.mock.calls.map(([route]) => route).some((route: string) => route.startsWith("/me"))).toBe(false);
  });

  it("opens the notifications panel in place, after the sheet has closed", async () => {
    const onOpenNotifications = jest.fn();
    const { getByLabelText, onClose } = await open({ onOpenNotifications });
    await fireEvent.press(getByLabelText("Notifications"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    await settle();
    expect(onOpenNotifications).toHaveBeenCalledTimes(1);
  });

  it("signs out and closes the sheet", async () => {
    const { getByLabelText, onClose } = await open();
    await fireEvent.press(getByLabelText("Sign out"));
    expect(onClose).toHaveBeenCalledTimes(1);
    await settle();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
