import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render } from "@testing-library/react-native";
import { I18nProvider } from "@vsolve/mobile-ui";
import { router } from "expo-router";
import { useCallback, useRef, useState, type ReactElement } from "react";
import { Pressable, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { catalogs } from "../../../i18n/catalogs";
import { ApplyDockContext, type DockConfig } from "../model/dock-context";
import { usePartnerApplication, useUpdateEmployerDetails } from "../queries";
import { EmployerAboutStep } from "./employer-about-step";
import { HiringAsStep } from "./hiring-as-step";
import { EmployerBusinessStep } from "./employer-business-step";

/**
 * The employer screens on the phone: the choice of who is hiring, the guard that keeps each type
 * on its own screens, and the Continue bar an employer screen asks the apply layout for.
 */

const { setPathname } = require("expo-router") as { setPathname: (path: string) => void };

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

// The sign-up name is only a starting value; here it never arrives.
jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => ({ GET: () => new Promise(() => {}) }),
  getCurrentPosition: jest.fn(),
  useReverseGeocode: () => ({ mutate: jest.fn(), isPending: false }),
  PlaceSearch: () => null,
}));

jest.mock("../queries", () => {
  const actual = jest.requireActual<typeof import("../queries")>("../queries");
  return {
    ...actual,
    usePartnerApplication: jest.fn(),
    useUpdateEmployerDetails: jest.fn(),
    useUploadEmployerLogo: () => ({ mutate: jest.fn(), isPending: false, error: null }),
    useRemoveEmployerLogo: () => ({ mutate: jest.fn(), isPending: false, error: null }),
  };
});

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

let lastDock: DockConfig | null = null;

function Harness({ children }: { children: ReactElement }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }));
  const [dockConfig, setDockConfig] = useState<DockConfig | null>(null);
  const onCommitRef = useRef<(() => void) | null>(null);
  const registerDock = useCallback((config: DockConfig | null) => {
    if (config?.onCommit) onCommitRef.current = config.onCommit;
    lastDock = config;
    setDockConfig((previous) => {
      if (!previous && !config) return null;
      if (
        previous &&
        config &&
        previous.label === config.label &&
        previous.proceedDisabled === config.proceedDisabled &&
        previous.isSaving === config.isSaving
      ) {
        return previous;
      }
      return config;
    });
  }, []);
  return (
    <I18nProvider locale="en-IN" catalog={catalogs["en-IN"]}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ApplyDockContext.Provider value={{ dockConfig, registerDock, scrollFieldIntoView: () => {} }}>
            {children}
            {dockConfig ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dock continue"
                onPress={() => onCommitRef.current?.()}
              >
                <Text>Dock continue</Text>
              </Pressable>
            ) : null}
          </ApplyDockContext.Provider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}

function employer(hiringAs: "" | "INDIVIDUAL" | "BUSINESS", overrides: Record<string, unknown> = {}) {
  return {
    hiring_as: hiringAs,
    poster_role: "",
    id_document_type: "",
    email: "",
    area: "",
    city: "",
    pin_code: "",
    business: null,
    missing_fields: [],
    ...overrides,
  };
}

function application(overrides: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    status: "DRAFT",
    version: 2,
    can_edit: true,
    track: "EMPLOYER",
    display_name: "Priya Sharma",
    employer: employer(""),
    documents: [],
    ...overrides,
  };
}

const mockMutate = jest.fn();

function givenApplication(data: unknown) {
  (usePartnerApplication as jest.Mock).mockReturnValue({
    data,
    error: null,
    isError: false,
    isPending: false,
    dataUpdatedAt: 1,
    errorUpdatedAt: 0,
    refetch: jest.fn(),
  });
}

beforeEach(() => {
  lastDock = null;
  mockMutate.mockReset();
  (router.push as jest.Mock).mockReset();
  (router.replace as jest.Mock).mockReset();
  (useUpdateEmployerDetails as jest.Mock).mockReturnValue({
    mutate: mockMutate.mockImplementation((_patch, options) => options?.onSuccess?.()),
    reset: jest.fn(),
    isPending: false,
    error: null,
  });
});

describe("who is hiring", () => {
  beforeEach(() => setPathname("/apply/hiring-as"));

  it("offers the two ways to hire, and no agency", async () => {
    givenApplication(application());
    const view = await render(<Harness><HiringAsStep /></Harness>);

    expect(view.getByText("Who is hiring?")).toBeTruthy();
    expect(view.getByText("For myself or my home")).toBeTruthy();
    expect(view.getByText("For my business")).toBeTruthy();
    expect(view.getByText(/We don't support agencies yet/)).toBeTruthy();
  });

  it("saves the choice and moves on to that type's own screen", async () => {
    givenApplication(application());
    const view = await render(<Harness><HiringAsStep /></Harness>);

    await fireEvent.press(view.getByText("For my business"));

    expect(mockMutate).toHaveBeenCalledWith({ hiring_as: "BUSINESS" }, expect.anything());
    expect(router.push).toHaveBeenCalledWith("/apply/employer/business");
  });

  it("asks before a switch that would clear what was typed", async () => {
    givenApplication(
      application({ employer: employer("INDIVIDUAL", { area: "Kondapur", city: "Hyderabad" }) }),
    );
    const view = await render(<Harness><HiringAsStep /></Harness>);

    await fireEvent.press(view.getByText("For my business"));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(view.getByText("Switch to For my business?")).toBeTruthy();

    await fireEvent.press(view.getByText("Switch"));
    expect(mockMutate).toHaveBeenCalledWith({ hiring_as: "BUSINESS" }, expect.anything());
  });

  it("keeps a chosen type's details when the same type is tapped again", async () => {
    givenApplication(application({ employer: employer("INDIVIDUAL", { area: "Kondapur" }) }));
    const view = await render(<Harness><HiringAsStep /></Harness>);

    await fireEvent.press(view.getByText("For myself or my home"));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/apply/employer/about");
  });

  it("sends anyone who is not an employer back to the overview", async () => {
    givenApplication(application({ track: "SERVICES", employer: null }));
    await render(<Harness><HiringAsStep /></Harness>);

    expect(router.replace).toHaveBeenCalledWith("/apply");
  });
});

describe("keeping each type on its own screens", () => {
  it("sends an individual who opens the business screen to their own", async () => {
    setPathname("/apply/employer/business");
    givenApplication(application({ employer: employer("INDIVIDUAL") }));
    await render(<Harness><EmployerBusinessStep /></Harness>);

    expect(router.replace).toHaveBeenCalledWith("/apply/employer/about");
  });

  it("sends an employer who has not chosen to the choice", async () => {
    setPathname("/apply/employer/about");
    givenApplication(application({ employer: employer("") }));
    await render(<Harness><EmployerAboutStep /></Harness>);

    expect(router.replace).toHaveBeenCalledWith("/apply/hiring-as");
  });
});

describe("an individual's details", () => {
  beforeEach(() => setPathname("/apply/employer/about"));

  const complete = {
    employer: employer("INDIVIDUAL", {
      email: "priya@example.com",
      area: "Kondapur",
      city: "Hyderabad",
      pin_code: "500084",
      id_document_type: "PAN",
    }),
  };

  it("asks the apply screen for a Continue bar that waits for the required fields", async () => {
    givenApplication(application({ employer: employer("INDIVIDUAL") }));
    await render(<Harness><EmployerAboutStep /></Harness>);

    expect(lastDock?.proceedDisabled).toBe(true);
    expect(lastDock?.backHref).toBe("/apply/hiring-as");
  });

  it("moves on to the documents without saving when nothing changed", async () => {
    givenApplication(application(complete));
    const view = await render(<Harness><EmployerAboutStep /></Harness>);
    expect(lastDock?.proceedDisabled).toBe(false);

    await act(async () => {
      await fireEvent.press(view.getByLabelText("Dock continue"));
    });

    expect(mockMutate).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/apply/documents");
  });

  it("shows a sent application read-only, with no Continue bar to save with", async () => {
    givenApplication(application({ ...complete, can_edit: false, status: "SUBMITTED" }));
    const view = await render(<Harness><EmployerAboutStep /></Harness>);

    expect(lastDock).toBeNull();
    expect(view.getByText(/with our team|can no longer|cannot be changed/i)).toBeTruthy();
  });
});
