import { act, fireEvent, render } from "@testing-library/react-native";
import { ApiRequestError } from "@vsolve/api-client";
import { I18nProvider } from "@vsolve/mobile-ui";

import { catalogs } from "../../../i18n/catalogs";
import { DeleteAccountDialog } from "./delete-account-dialog";

const mockMutate = jest.fn();
const mockReset = jest.fn();
const mockSignOut = jest.fn(() => Promise.resolve());
let mockState: { isPending: boolean; isError: boolean; error: unknown } = {
  isPending: false,
  isError: false,
  error: null,
};

jest.mock("@/features/account/privacy-queries", () => ({
  useCreatePrivacyRequest: () => ({ mutate: mockMutate, reset: mockReset, ...mockState }),
}));
jest.mock("@vsolve/mobile-core", () => ({
  useMobileLogout: () => mockSignOut,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}));

const CONSEQUENCE =
  "Your account closes now: you're signed out everywhere and stop getting job offers. We delete your data after 30 days, except records the law requires us to keep. Sign in again before then to keep your account.";

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
  mockState = { isPending: false, isError: false, error: null };
});

describe("DeleteAccountDialog", () => {
  it("is the website's confirmation, word for word", async () => {
    const { getByText } = await open();
    expect(getByText("Delete your account?")).toBeTruthy();
    expect(getByText(CONSEQUENCE)).toBeTruthy();
    expect(getByText("Delete my account")).toBeTruthy();
    expect(getByText("Cancel")).toBeTruthy();
  });

  it("files an erasure request only when Delete my account is pressed", async () => {
    const { getByText } = await open();
    expect(mockMutate).not.toHaveBeenCalled();
    await fireEvent.press(getByText("Delete my account"));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toBe("ERASURE");
  });

  it("once accepted, says when the account goes and signs out", async () => {
    const { getByText, getAllByText, onOpenChange } = await open();
    await fireEvent.press(getByText("Delete my account"));
    const options = mockMutate.mock.calls[0][1] as {
      onSuccess: (created: { scheduled_for: string | null; requested_at: string }) => void;
    };
    expect(onOpenChange).not.toHaveBeenCalled();

    await act(async () => {
      options.onSuccess({
        scheduled_for: "2026-12-18T06:30:00Z",
        requested_at: "2026-11-18T06:30:00Z",
      });
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(getByText("Your account is closed")).toBeTruthy();
    expect(
      getByText(
        "We'll delete it on 18 Dec 2026. Changed your mind? Sign in again before then and your account stays.",
      ),
    ).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
    await fireEvent.press(getAllByText("Sign out")[0]);
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("Cancel closes without sending anything", async () => {
    const { getByText, onOpenChange } = await open();
    await fireEvent.press(getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("never reports success when the request failed", async () => {
    mockState = { isPending: false, isError: true, error: new Error("offline") };
    const { getByText } = await open();
    expect(getByText("We couldn't send that request")).toBeTruthy();
  });

  it("says why when open bookings stop the deletion", async () => {
    mockState = {
      isPending: false,
      isError: true,
      error: new ApiRequestError(409, {
        code: "account_deletion_open_work",
        message: "You have bookings that are still open.",
        details: {},
        retryable: false,
        request_id: "req-1",
      }),
    };
    const { getByText } = await open();
    expect(
      getByText("Finish or cancel your open bookings first, then delete your account."),
    ).toBeTruthy();
  });
});
