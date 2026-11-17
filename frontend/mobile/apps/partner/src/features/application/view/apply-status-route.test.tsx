import { render } from "@testing-library/react-native";

import StatusRoute from "../../../../app/(app)/apply/status";

let mockStatus: string | undefined;
const mockRedirect = jest.fn();

jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
}));
jest.mock("@/features/application/queries", () => ({
  usePartnerApplication: () => ({ data: mockStatus ? { status: mockStatus } : undefined }),
}));
jest.mock("@/features/application/view/application-status-screen", () => {
  const { Text } = jest.requireActual("react-native");
  return { ApplicationStatusScreen: () => <Text>status screen</Text> };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus = undefined;
});

describe("/apply/status", () => {
  it.each(["SUBMITTED", "UNDER_REVIEW"])("sends %s to the overview, as the website shows it", async (status) => {
    mockStatus = status;
    const view = await render(<StatusRoute />);
    expect(mockRedirect).toHaveBeenCalledWith("/apply");
    expect(view.queryByText("status screen")).toBeNull();
  });

  it.each(["DECLINED", "REJECTED"])("keeps the status screen for %s, where the appeal lives", async (status) => {
    mockStatus = status;
    const view = await render(<StatusRoute />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(view.getByText("status screen")).toBeTruthy();
  });
});
