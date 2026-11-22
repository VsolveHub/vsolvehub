import { ApiRequestError } from "@vsolve/api-client";
import { render } from "@testing-library/react-native";

import StatusRoute from "../../../../app/(app)/apply/status";

let mockQuery: { isPending: boolean; isError: boolean; data?: { status: string }; error: unknown; refetch: jest.Mock };
const mockRedirect = jest.fn();

jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
}));
jest.mock("@/features/application/queries", () => ({
  usePartnerApplication: () => mockQuery,
}));
jest.mock("@/features/application/view/application-status-screen", () => {
  const { Text } = jest.requireActual("react-native");
  return { ApplicationStatusScreen: () => <Text>status screen</Text> };
});

function loaded(status: string) {
  mockQuery = { isPending: false, isError: false, data: { status }, error: null, refetch: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("/apply/status", () => {
  it.each(["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUIRED", "APPROVED"])(
    "sends %s to the overview, as the website shows it",
    async (status) => {
      loaded(status);
      const view = await render(<StatusRoute />);
      expect(mockRedirect).toHaveBeenCalledWith("/apply");
      expect(view.queryByText("status screen")).toBeNull();
    },
  );

  it.each(["DECLINED", "REJECTED"])("keeps the status screen for %s, where the appeal lives", async (status) => {
    loaded(status);
    const view = await render(<StatusRoute />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(view.getByText("status screen")).toBeTruthy();
  });

  // Regression: while loading, the old screen was drawn and invented "Application in review".
  it("shows a loading state, not the status screen, until the status is known", async () => {
    mockQuery = { isPending: true, isError: false, data: undefined, error: null, refetch: jest.fn() };
    const view = await render(<StatusRoute />);
    expect(view.getByText("Loading your application…")).toBeTruthy();
    expect(view.queryByText("status screen")).toBeNull();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("shows an error with a retry, not the status screen, when the status cannot be loaded", async () => {
    mockQuery = { isPending: false, isError: true, data: undefined, error: new Error("offline"), refetch: jest.fn() };
    const view = await render(<StatusRoute />);
    expect(view.getByText("We could not load your application")).toBeTruthy();
    expect(view.queryByText("status screen")).toBeNull();
  });

  it("sends someone who has not applied to the overview", async () => {
    mockQuery = {
      isPending: false,
      isError: true,
      data: undefined,
      error: new ApiRequestError(404, {
        code: "not_found",
        message: "Not found.",
        details: null,
        retryable: false,
        request_id: "r",
      }),
      refetch: jest.fn(),
    };
    await render(<StatusRoute />);
    expect(mockRedirect).toHaveBeenCalledWith("/apply");
  });
});
