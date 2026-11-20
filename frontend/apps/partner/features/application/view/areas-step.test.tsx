import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { withI18n } from "@/i18n/test-utils";
import { AreasStep } from "./areas-step";

const mockAreas = [
  {
    id: "area-1",
    name: "Mahbubnagar Town",
    slug: "mahbubnagar-town",
    timezone: "Asia/Kolkata",
    is_accepting_partners: true,
    postal_codes: ["509001", "509002"],
  },
  {
    id: "area-2",
    name: "Jadcherla",
    slug: "jadcherla",
    timezone: "Asia/Kolkata",
    is_accepting_partners: true,
    postal_codes: ["509301"],
  },
];

let referenceServiceAreas = mockAreas;
let isReferencePending = false;
let isReferenceError = false;

vi.mock("../reference-queries", () => ({
  useApplicationReference: () => ({
    serviceAreas: referenceServiceAreas,
    isPending: isReferencePending,
    isError: isReferenceError,
    refetch: vi.fn(),
  }),
}));

let mockDraft = {
  serviceAreaIds: [] as string[],
  requestedPostalCodes: [] as string[],
};
let mockApplication: Partial<Schemas["PartnerApplication"]> | null = null;
let updateMock = vi.fn();
let isReadOnly = false;

vi.mock("./application-editor", () => ({
  useApplicationEditor: () => ({
    draft: mockDraft,
    update: updateMock,
    application: mockApplication,
    isReadOnly,
  }),
  useProceedDisabled: vi.fn(),
}));

function renderStep() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    withI18n(
      <QueryClientProvider client={queryClient}>
        <AreasStep />
      </QueryClientProvider>,
    ),
  );
}

describe("AreasStep", () => {
  beforeEach(() => {
    referenceServiceAreas = mockAreas;
    isReferencePending = false;
    isReferenceError = false;
    mockDraft = {
      serviceAreaIds: [],
      requestedPostalCodes: [],
    };
    mockApplication = {
      area_requests: [],
    };
    updateMock = vi.fn((patch) => {
      Object.assign(mockDraft, patch);
    });
    isReadOnly = false;
  });

  it("renders open service areas as checkboxes", () => {
    renderStep();

    expect(screen.getByText("Mahbubnagar Town")).toBeInTheDocument();
    expect(screen.getByText("Jadcherla")).toBeInTheDocument();
  });

  it("toggling an area updates serviceAreaIds", () => {
    renderStep();

    const jadcherlaCheckbox = screen.getByRole("checkbox", { name: /jadcherla/i });
    fireEvent.click(jadcherlaCheckbox);

    expect(updateMock).toHaveBeenCalledWith({
      serviceAreaIds: ["area-2"],
    });
  });

  it("typing a matching PIN ticks the covering open area and shows matched notice", () => {
    renderStep();

    // Click "My area is not listed"
    fireEvent.click(screen.getByRole("button", { name: /\+ my area is not listed/i }));

    const pinInput = screen.getByPlaceholderText(/509216/i);
    fireEvent.change(pinInput, { target: { value: "509001" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(updateMock).toHaveBeenCalledWith({
      serviceAreaIds: ["area-1"],
    });
    expect(
      screen.getByText(/509001 is in Mahbubnagar Town. We ticked it for you./i),
    ).toBeInTheDocument();
  });

  it("a PIN covered by two open areas ticks both of them", () => {
    referenceServiceAreas = [
      ...mockAreas,
      {
        id: "area-3",
        name: "Shadnagar",
        slug: "shadnagar",
        timezone: "Asia/Kolkata",
        is_accepting_partners: true,
        postal_codes: ["509001"],
      },
    ];
    renderStep();

    fireEvent.click(screen.getByRole("button", { name: /\+ my area is not listed/i }));
    fireEvent.change(screen.getByPlaceholderText(/509216/i), { target: { value: "509001" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(updateMock).toHaveBeenCalledWith({ serviceAreaIds: ["area-1", "area-3"] });
    expect(screen.getByText(/509001 is in Mahbubnagar Town, Shadnagar/i)).toBeInTheDocument();
  });

  it("typing an unmatched PIN adds it to requested postal codes", () => {
    renderStep();

    fireEvent.click(screen.getByRole("button", { name: /\+ my area is not listed/i }));

    const pinInput = screen.getByPlaceholderText(/509216/i);
    fireEvent.change(pinInput, { target: { value: "509216" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(updateMock).toHaveBeenCalledWith({
      requestedPostalCodes: ["509216"],
    });
  });

  it("shows invalid error for malformed PIN", () => {
    renderStep();

    fireEvent.click(screen.getByRole("button", { name: /\+ my area is not listed/i }));

    const pinInput = screen.getByPlaceholderText(/509216/i);
    fireEvent.change(pinInput, { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(screen.getByText(/enter a valid 6-digit indian pin code/i)).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("displays server status badge for requested PINs", () => {
    mockDraft.requestedPostalCodes = ["509216"];
    mockApplication = {
      area_requests: [
        {
          id: "req-1",
          postal_code: "509216",
          status: "WAITING",
          place: "Devarkadra",
          covering_area_id: null,
          covering_area_name: null,
          created_at: "2026-11-19T10:00:00Z",
          notified_at: null,
          dismissed_at: null,
        },
      ],
    };

    renderStep();

    expect(screen.getByText("509216")).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
  });

  it("allows ticking an area that has become READY", () => {
    mockDraft.requestedPostalCodes = ["509216"];
    mockApplication = {
      area_requests: [
        {
          id: "req-1",
          postal_code: "509216",
          status: "READY",
          place: "Devarkadra",
          covering_area_id: "area-new",
          covering_area_name: "Devarkadra Rural",
          created_at: "2026-11-19T10:00:00Z",
          notified_at: null,
          dismissed_at: null,
        },
      ],
    };

    renderStep();

    expect(screen.getByText(/Ready · now in Devarkadra Rural/i)).toBeInTheDocument();
    const tickBtn = screen.getByRole("button", { name: "Tick it" });
    fireEvent.click(tickBtn);

    expect(updateMock).toHaveBeenCalledWith({
      serviceAreaIds: ["area-new"],
      requestedPostalCodes: [],
    });
  });

  it("renders Case F directly when 0 open areas exist in system", () => {
    referenceServiceAreas = [];
    renderStep();

    expect(
      screen.getByText(
        /we're not active in your city yet. tell us your pin code and we'll notify you when we open/i,
      ),
    ).toBeInTheDocument();
    // PIN input should be directly visible without clicking a toggle button
    expect(screen.getByPlaceholderText(/509216/i)).toBeInTheDocument();
  });
});
