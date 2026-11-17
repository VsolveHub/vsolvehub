import { fireEvent, render } from "@testing-library/react-native";
import { I18nProvider } from "@vsolve/mobile-ui";

import { catalogs } from "../../../i18n/catalogs";
import { DeleteAccountDialog } from "./delete-account-dialog";

const mockMutate = jest.fn();
const mockReset = jest.fn();
let mockState = { isPending: false, isError: false };

jest.mock("@/features/account/privacy-queries", () => ({
  useCreatePrivacyRequest: () => ({ mutate: mockMutate, reset: mockReset, ...mockState }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}));

async function open(onOpenChange = jest.fn()) {
  const view = await render(
    <I18nProvider locale="en-IN" catalog={catalogs["en-IN"]}>
      <DeleteAccountDialog open onOpenChange={onOpenChange} />
    </I18nProvider>,
  );
  return { ...view, onOpenChange };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState = { isPending: false, isError: false };
});

describe("DeleteAccountDialog", () => {
  it("is the website's confirmation, word for word", async () => {
    const { getByText } = await open();
    expect(getByText("Delete your account?")).toBeTruthy();
    expect(
      getByText(
        "We'll close your partner account and delete your data, except records the law requires us to keep. Our team will contact you to confirm.",
      ),
    ).toBeTruthy();
    expect(getByText("Request deletion")).toBeTruthy();
    expect(getByText("Cancel")).toBeTruthy();
  });

  it("files an erasure request only when Request deletion is pressed", async () => {
    const { getByText } = await open();
    expect(mockMutate).not.toHaveBeenCalled();
    await fireEvent.press(getByText("Request deletion"));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toBe("ERASURE");
  });

  it("closes once the server has accepted the request", async () => {
    const { getByText, onOpenChange } = await open();
    await fireEvent.press(getByText("Request deletion"));
    const options = mockMutate.mock.calls[0][1] as { onSuccess: () => void };
    expect(onOpenChange).not.toHaveBeenCalled();
    options.onSuccess();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Cancel closes without sending anything", async () => {
    const { getByText, onOpenChange } = await open();
    await fireEvent.press(getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("never reports success when the request failed", async () => {
    mockState = { isPending: false, isError: true };
    const { getByText } = await open();
    expect(getByText("We couldn't send that request")).toBeTruthy();
  });
});
