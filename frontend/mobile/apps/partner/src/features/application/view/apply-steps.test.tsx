// Ported from frontend/apps/partner/features/application/view/apply-steps.test.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { fireEvent, render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useCallback, useRef } from "react";
import { Pressable, Text } from "react-native";
import { ApplyDockContext, type DockConfig } from "../model/dock-context";
import { router } from "expo-router";
const { setPathname } = require("expo-router") as { setPathname: (p: string) => void };
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AboutStep } from "./about-step";
import { ApplicationEditor } from "./application-editor";
import { DocumentsStep } from "./documents-step";
import { usePartnerApplication, useUpdateApplication } from "../queries";

const mockPush = router.push;

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
  usePartnerDocumentAccess: () => ({ mutateAsync: jest.fn(), isPending: false }),
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

function Harness({ children }: { children: ReactElement }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const [dockConfig, setDockConfig] = useState<DockConfig | null>(null);
  const onCommitRef = useRef<(() => void) | null>(null);
  const registerDock = useCallback((config: DockConfig | null) => {
    if (config?.onCommit) onCommitRef.current = config.onCommit;
    setDockConfig((prev) => {
      if (!prev && !config) return null;
      if (prev && config && prev.label === config.label && prev.proceedDisabled === config.proceedDisabled) {
        return prev;
      }
      return config;
    });
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <ApplyDockContext.Provider value={{ dockConfig, registerDock, scrollFieldIntoView: () => {} }}>
          {children}
          {dockConfig ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save and Continue"
              onPress={() => onCommitRef.current?.()}
            >
              <Text>Save and Continue</Text>
            </Pressable>
          ) : null}
        </ApplyDockContext.Provider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

function renderInSafeArea(ui: ReactElement) {
  return render(<Harness>{ui}</Harness>);
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
  setPathname("/apply/about");
  (mockPush as jest.Mock).mockReset();
  (useUpdateApplication as jest.Mock).mockReturnValue({
    mutate: jest.fn((_vars, options) => options?.onSuccess?.()),
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

  const document = (overrides: Record<string, unknown>) => ({
    id: "d-1",
    kind: "GOVERNMENT_ID",
    version: 1,
    status: "PENDING",
    scan_status: "CLEAN",
    review_reason: "",
    can_replace: true,
    file_name: "aadhaar.jpg",
    content_type: "image/jpeg",
    size_bytes: 120_000,
    uploaded_at: "2026-08-02T09:00:00Z",
    ...overrides,
  });

  function showDocuments(documents: unknown[], applicationOverrides: Record<string, unknown> = {}) {
    (usePartnerApplication as jest.Mock).mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      data: { ...APPLICATION, documents, ...applicationOverrides },
      refetch: jest.fn(),
    });
    return renderInSafeArea(<DocumentsStep />);
  }

  it("lets a draft applicant replace a document that is still waiting for review", async () => {
    // Regression: Replace was offered only for a rejected document, but the server lets an
    // applicant replace any document while the application is a draft, so a wrong photo was stuck.
    const view = await showDocuments([document({ status: "PENDING", can_replace: true })]);
    expect(view.getByRole("button", { name: "Replace file" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "Re-upload document" })).toBeNull();
  });

  it("treats a file that failed the security scan as rejected, with the reason and a re-upload", async () => {
    // Regression: only `status` was checked, so a scan-failed file read "In review" with no way on.
    const view = await showDocuments([document({ status: "PENDING", scan_status: "REJECTED", can_replace: true })]);
    expect(view.getByText("This file failed our security check. Upload it again.")).toBeTruthy();
    expect(view.getByRole("button", { name: "Re-upload document" })).toBeTruthy();
  });

  it("shows the reviewer's reason for a rejected document", async () => {
    const view = await showDocuments([document({ status: "REJECTED", review_reason: "Photo is blurred." })]);
    expect(view.getByText("Reason: Photo is blurred.")).toBeTruthy();
  });

  it("is locked while the application is with a reviewer", async () => {
    const view = await showDocuments([document({ status: "PENDING", can_replace: false })], { status: "SUBMITTED" });
    expect(view.getByText("Locked while your application is being reviewed.")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Replace file" })).toBeNull();
  });

  it("lets the applicant view an uploaded document and shows when it was uploaded", async () => {
    const view = await showDocuments([document({})]);
    expect(view.getByRole("button", { name: "View document" })).toBeTruthy();
    expect(view.getByText(/2 Aug 2026/)).toBeTruthy();
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
    expect(await view.findByText(/Take photo/i)).toBeTruthy();
    expect(view.getByText(/photo library/i)).toBeTruthy();
    expect(view.getByText(/Choose document/i)).toBeTruthy();
  });
});
