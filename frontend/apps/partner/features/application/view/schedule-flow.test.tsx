import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AvailabilityEditor } from "./availability-editor";
import { ReviewStep } from "./review-step";
import type { Schemas } from "@/lib/api/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/apply/schedule",
}));

const mockApplication: { data: Schemas["PartnerApplication"] } = {
  data: {
    id: "app-1",
    partner_id: "p-1",
    status: "DRAFT",
    version: 1,
    display_name: "Ravi Kumar",
    biography: "Certified technician",
    experience_years: 5,
    skill_codes: ["electrician"],
    service_variant_ids: ["v-1"],
    service_area_ids: ["area-1"],
    consents: [
      { id: "c-1", purpose: "partner_terms", document_version: "2026-07", signed_at: "2026-01-01" },
      { id: "c-2", purpose: "privacy_notice", document_version: "2026-07", signed_at: "2026-01-01" },
    ],
    documents: [
      {
        id: "d-1",
        kind: "GOVERNMENT_ID",
        status: "APPROVED",
        version: 1,
        uploaded_at: "2026-01-01",
        reviewed_at: "2026-01-01",
        review_reason: null,
      },
    ],
    transitions: [],
    change_request_message: null,
    submitted_at: null,
    reviewed_at: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
};

const mockAvailability = {
  data: {
    rules: [
      {
        id: "rule-1",
        service_area_id: "area-1",
        weekday: 0,
        starts_at: "09:00:00",
        ends_at: "18:00:00",
        ends_next_day: false,
        is_active: true,
      },
    ],
    exceptions: [],
  },
  isLoading: false,
};

vi.mock("../queries", () => ({
  usePartnerApplication: () => mockApplication,
  usePartnerAvailability: () => mockAvailability,
  isVersionConflict: () => false,
  useSubmitApplication: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  }),
}));

vi.mock("../reference-queries", () => ({
  useApplicationReference: () => ({
    skills: [{ code: "electrician", name: "Electrician", description: "" }],
    serviceAreas: [{ id: "area-1", name: "West Hyderabad", slug: "west-hyderabad", is_accepting_partners: true }],
    requiredConsents: [
      { id: "c-1", purpose: "partner_terms", title: "Terms", document_version: "2026-07", document_url: "https://terms" },
      { id: "c-2", purpose: "privacy_notice", title: "Privacy", document_version: "2026-07", document_url: "https://privacy" },
    ],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useServiceAreas: () => ({
    data: [{ id: "area-1", name: "West Hyderabad", slug: "west-hyderabad" }],
  }),
  useSkills: () => ({
    data: [{ code: "electrician", name: "Electrician" }],
  }),
  useRequiredConsents: () => ({
    data: [],
  }),
}));

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("Schedule auto-save behavior", () => {
  beforeEach(() => {
    push.mockReset();
  });

  const areas = [{ id: "area-1", label: "West Hyderabad" }];

  it("auto-saves modified schedule before navigating to review", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <AvailabilityEditor
        areas={areas}
        initialPeriods={[]}
        onSave={onSave}
      />
    );

    // Click "Review Application" with no changes
    const reviewBtn = screen.getByRole("button", { name: /Review Application/i });
    fireEvent.click(reviewBtn);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/apply/review");
    });
  });

  it("auto-saves edited periods when Review Application is clicked", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <AvailabilityEditor
        areas={areas}
        initialPeriods={[]}
        onSave={onSave}
      />
    );

    // Open set shift modal for Monday
    const setShiftButtons = screen.getAllByRole("button", { name: /Set Shift/i });
    fireEvent.click(setShiftButtons[0]);

    // Save shift in modal
    const saveShiftBtn = screen.getByRole("button", { name: /Save Shift/i });
    fireEvent.click(saveShiftBtn);

    // Now hasChanges is true. Click "Review Application"
    const reviewBtn = screen.getByRole("button", { name: /Review Application/i });
    fireEvent.click(reviewBtn);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith("/apply/review");
    });
  });
});

describe("ReviewStep working hours section", () => {
  it("displays configured working hours for active service areas", () => {
    mockAvailability.data = {
      rules: [
        {
          id: "rule-1",
          service_area_id: "area-1",
          weekday: 0,
          starts_at: "09:00:00",
          ends_at: "18:00:00",
          ends_next_day: false,
          is_active: true,
        },
      ],
      exceptions: [],
    };

    renderWithClient(<ReviewStep />);

    expect(screen.getByText(/4\. Working Hours & Availability/i)).toBeDefined();
    expect(screen.getAllByText(/West Hyderabad/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/9 hrs \/ week/i)).toBeDefined();
  });

  it("displays missing hours warning and edit link when active service area has no rules", () => {
    mockAvailability.data = {
      rules: [],
      exceptions: [],
    };

    renderWithClient(<ReviewStep />);

    expect(screen.getByText(/No hours set/i)).toBeDefined();
    expect(screen.getByText(/No working hours set for this area/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /Edit working hours →/i })).toBeDefined();

    // Submit button should be disabled when hours are missing
    const submitButton = screen.getByRole("button", { name: /Submit Application/i });
    expect(submitButton).toHaveProperty("disabled", true);
  });
});
