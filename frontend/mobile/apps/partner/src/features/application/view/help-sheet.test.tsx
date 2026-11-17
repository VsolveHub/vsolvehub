import { fireEvent, render } from "@testing-library/react-native";
import { I18nProvider } from "@vsolve/mobile-ui";
import { Linking } from "react-native";

import { catalogs } from "../../../i18n/catalogs";
import { HelpSheet } from "./help-sheet";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

async function open(onOpenChange = jest.fn()) {
  const view = await render(
    <I18nProvider locale="en-IN" catalog={catalogs["en-IN"]}>
      <HelpSheet open onOpenChange={onOpenChange} />
    </I18nProvider>,
  );
  return { ...view, onOpenChange };
}

describe("HelpSheet", () => {
  let openURL: jest.SpyInstance;
  beforeEach(() => {
    openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("is the website's Need help? sheet: the hours and three ways to reach support", async () => {
    const { getByText } = await open();
    expect(getByText("Need help?")).toBeTruthy();
    expect(getByText("9am–9pm, every day")).toBeTruthy();
    expect(getByText("Call · +91 879 056 4634")).toBeTruthy();
    expect(getByText("WhatsApp")).toBeTruthy();
    expect(getByText("Email · support@vsolvehub.com")).toBeTruthy();
  });

  it("calls, opens WhatsApp and writes an email through the support desk's own details", async () => {
    const { getByText } = await open();

    await fireEvent.press(getByText(/Call ·/));
    expect(openURL).toHaveBeenLastCalledWith("tel:+918790564634");

    await fireEvent.press(getByText("WhatsApp"));
    expect(String(openURL.mock.calls.at(-1)?.[0]).startsWith("https://wa.me/918790564634?text=")).toBe(true);

    await fireEvent.press(getByText(/Email ·/));
    expect(String(openURL.mock.calls.at(-1)?.[0]).startsWith("mailto:support@vsolvehub.com")).toBe(true);
  });
});
