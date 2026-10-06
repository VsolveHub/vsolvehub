// Ported from frontend/apps/partner/features/application/view/apply-steps.test.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { fireEvent, render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AboutStep } from "./about-step";
import { ApplicationEditor } from "./application-editor";
import { DocumentsStep } from "./documents-step";
import { usePartnerApplication, useUpdateApplication } from "../queries";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/apply/about",
}));

jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock("../queries", () => {
  const actual = jest.requireActual<typeof import("../queries")>("../queries");
  return {
    ...actual,
    usePartnerApplication: jest.fn(),
    useUpdateApplication: jest.fn(),
  };
});

jest.mock("../upload-queries", () => ({
  useUploadDocument: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    reset: jest.fn(),
  }),
  UploadFailure: class UploadFailure extends Error {
    reason: string;
    constructor(reason: string, message: string) {
      super(message);
      this.reason = reason;
    }
  },
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderInSafeArea(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>);
}

const APPLICATION = {
  id: "app-1",
  partner_id: "p-1",
  status: "DRAFT" as const,
  version: 2,
  display_name: "Ramesh Kumar",
  biography: "",
  experience_years: 5,
  skill_codes: [],
  service_variant_ids: [],
  service_area_ids: [],
  consents: [],
  documents: [],
  transitions: [],
  change_request_message: null,
  submitted_at: null,
  reviewed_at: null,
  review_assigned_at: null,
  review_assigned_to_id: null,
  created_at: "2026-08-01T09:00:00Z",
  updated_at: "2026-08-01T09:00:00Z",
};

function refusal(status: number, code: string) {
  return new ApiRequestError(status, {
    code,
    message: "Refused.",
    details: null,
    retryable: false,
    request_id: "r",
  });
}

beforeEach(() => {
  mockPush.mockReset();
  (useUpdateApplication as jest.Mock).mockReturnValue({
    mutate: jest.fn(),
    reset: jest.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
  });
});

describe("application editor", () => {
  it("shows a skeleton while the application is loading", async () => {
    (usePartnerApplication as jest.Mock).mockReturnValue({
      isPending: true,
      isError: false,
      error: null,
      data: undefined,
      refetch: jest.fn(),
    });

    const view = await renderInSafeArea(
      <ApplicationEditor title="Personal Information">
        <AboutStep />
      </ApplicationEditor>,
    );

    expect(view.getByLabelText("Loading your application")).toBeTruthy();
  });

  it("shows the load error copy when the application cannot be read", async () => {
    (usePartnerApplication as jest.Mock).mockReturnValue({
      isPending: false,
      isError: true,
      error: refusal(500, "server_error"),
      data: undefined,
      refetch: jest.fn(),
    });

    const view = await renderInSafeArea(
      <ApplicationEditor title="Personal Information">
        <AboutStep />
      </ApplicationEditor>,
    );

    expect(view.getByText("We could not load your application")).toBeTruthy();
    expect(view.getByText("Nothing you have saved is lost. Check your connection and try again.")).toBeTruthy();
    fireEvent.press(view.getByRole("button", { name: "Try again" }));
  });

  it("shows a filled name of Ramesh Kumar", async () => {
    (usePartnerApplication as jest.Mock).mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      data: APPLICATION,
      refetch: jest.fn(),
    });

    const view = await renderInSafeArea(
      <ApplicationEditor title="Personal Information">
        <AboutStep />
      </ApplicationEditor>,
    );

    expect(view.getByDisplayValue("Ramesh Kumar")).toBeTruthy();
    fireEvent.press(view.getByRole("button", { name: "Save and Continue" }));
    expect(mockPush).toHaveBeenCalledWith("/apply/work");
  });
});

describe("documents step", () => {
  it("shows a loading line, then Not uploaded when the application is missing", async () => {
    (usePartnerApplication as jest.Mock).mockReturnValue({
      isPending: true,
      isError: false,
      error: null,
      data: undefined,
      refetch: jest.fn(),
    });

    const pending = await renderInSafeArea(<DocumentsStep />);
    expect(pending.getByText("Loading documents…")).toBeTruthy();
    await pending.unmount();

    (usePartnerApplication as jest.Mock).mockReturnValue({
      isPending: false,
      isError: true,
      error: refusal(404, "not_found"),
      data: undefined,
      refetch: jest.fn(),
    });

    const missing = await renderInSafeArea(<DocumentsStep />);
    expect(missing.getAllByText("Not uploaded").length).toBeGreaterThan(0);
  });

  it("opens a document chooser with Take photo, Choose photo and Choose PDF", async () => {
    (usePartnerApplication as jest.Mock).mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      data: APPLICATION,
      refetch: jest.fn(),
    });

    const view = await renderInSafeArea(<DocumentsStep />);
    fireEvent.press(view.getAllByRole("button", { name: "Choose a file" })[0]!);
    expect(await view.findByText("Take photo")).toBeTruthy();
    expect(view.getByText("Choose photo")).toBeTruthy();
    expect(view.getByText("Choose PDF")).toBeTruthy();
  });
});
