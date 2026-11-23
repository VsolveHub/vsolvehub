import { act, fireEvent, render } from "@testing-library/react-native";
import { I18nProvider } from "@vsolve/mobile-ui";
import { router } from "expo-router";
import { BackHandler } from "react-native";

import { catalogs } from "../../i18n/catalogs";
import { handleFocusedBack } from "../session/focused-back";
import { DeleteAccountScreen } from "./delete-account-screen";

const mockMutate = jest.fn();
const mockSignOut = jest.fn(() => Promise.resolve());

jest.mock("./privacy-queries", () => ({
  useCreatePrivacyRequest: () => ({ mutate: mockMutate, isError: false, error: null }),
}));
jest.mock("@vsolve/mobile-core", () => ({
  useMobileLogout: () => mockSignOut,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}));
jest.mock("@/features/onboarding/components/brand-header", () => {
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    BrandHeader: ({ onBack }: { onBack?: () => void }) => (
      <Pressable accessibilityLabel="Go back" onPress={onBack}>
        <Text>Own header</Text>
      </Pressable>
    ),
  };
});

let hardwareBack: (() => boolean | undefined) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  hardwareBack = null;
  jest.spyOn(BackHandler, "addEventListener").mockImplementation((_event, listener) => {
    hardwareBack = () => listener({ type: "hardwareBackPress", timeStamp: 0 });
    return { remove: jest.fn() };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function open(showHeader?: boolean) {
  return render(
    <I18nProvider locale="en-IN" catalog={catalogs["en-IN"]}>
      {showHeader === undefined ? <DeleteAccountScreen /> : <DeleteAccountScreen showHeader={showHeader} />}
    </I18nProvider>,
  );
}

async function goToConfirmStep(view: Awaited<ReturnType<typeof open>>) {
  await fireEvent.press(view.getByLabelText("Delete my account"));
  expect(view.getByText("Type DELETE to confirm")).toBeTruthy();
}

describe("DeleteAccountScreen headers", () => {
  it("keeps its own header outside the tabs shell", async () => {
    const view = await open();
    expect(view.getByText("Own header")).toBeTruthy();
  });

  it("leaves the header to the tabs shell under /me", async () => {
    const view = await open(false);
    expect(view.queryByText("Own header")).toBeNull();
  });
});

describe("DeleteAccountScreen back", () => {
  it("the shell's back bar steps from confirm back to the warning, not out of the screen", async () => {
    const view = await open(false);
    await goToConfirmStep(view);
    const leave = jest.fn();

    await act(async () => handleFocusedBack(leave));

    expect(view.getByText("Delete your account?")).toBeTruthy();
    expect(leave).not.toHaveBeenCalled();
  });

  it("the shell's back bar leaves from the first step", async () => {
    await open(false);
    const leave = jest.fn();

    await act(async () => handleFocusedBack(leave));

    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("stops steering the shell's back bar once it closes", async () => {
    const view = await open(false);
    await goToConfirmStep(view);
    view.unmount();
    const leave = jest.fn();

    handleFocusedBack(leave);

    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("its own header steps back too", async () => {
    const view = await open();
    await goToConfirmStep(view);

    await fireEvent.press(view.getByLabelText("Go back"));

    expect(view.getByText("Delete your account?")).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it("Android's back button steps back, then leaves", async () => {
    const view = await open(false);
    await goToConfirmStep(view);

    let handled: boolean | undefined;
    await act(async () => {
      handled = hardwareBack?.();
    });
    expect(handled).toBe(true);
    expect(view.getByText("Delete your account?")).toBeTruthy();

    expect(hardwareBack?.()).toBe(false);
  });

  it("back after the account is closed signs out like Done", async () => {
    mockMutate.mockImplementation((_kind: string, options: { onSuccess: (created: object) => void }) =>
      options.onSuccess({ scheduled_for: "2026-12-23T00:00:00Z" }),
    );
    const view = await open(false);
    await goToConfirmStep(view);
    await fireEvent.changeText(view.getByPlaceholderText("DELETE"), "DELETE");
    await fireEvent.press(view.getByLabelText("Delete my account"));
    expect(view.getByText("Your account is closed")).toBeTruthy();
    const leave = jest.fn();

    await act(async () => handleFocusedBack(leave));

    expect(leave).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/login");
  });
});
