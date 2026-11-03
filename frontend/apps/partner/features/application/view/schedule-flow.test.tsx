import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@vsolve/api-client";

import { withI18n } from "@/i18n/test-utils";

import { AvailabilityEditor } from "./availability-editor";
import { ReviewStep } from "./review-step";

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
    track: "SERVICES",
    version: 1,
    display_name: "Ravi Kumar",
    biography: "Certified technician",
    experience_years: 5,
    skill_codes: ["electrician"],
    service_variant_ids: ["v-1"],
    service_area_ids: ["area-1"],
    consents: [
      {
        id: "c-1",
        purpose: "partner_terms",
        document_version: "2026-07",
        accepted_at: "2026-01-01",
        withdrawn_at: null,
      },
      {
        id: "c-2",
        purpose: "privacy_notice",
        document_version: "2026-07",
        accepted_at: "2026-01-01",
        withdrawn_at: null,
      },
    ],
    documents: [
      {
        id: "d-1",
        kind: "GOVERNMENT_ID",
        status: "APPROVED",
        version: 1,
        content_type: "image/jpeg",
        size_bytes: 120_000,
        sha256: "0".repeat(64),
        scan_status: "CLEAN",
        scanned_at: "2026-01-01",
        uploaded_at: "2026-01-01",
        reviewed_at: "2026-01-01",
        review_reason: "",
        file_name: "government_id_v1.jpg",
        can_replace: true,
      },
    ],
    transitions: [],
    can_edit: true,
    required_document_kinds: ["GOVERNMENT_ID"],
    consents_complete: true,
    change_request_message: "",
    submitted_at: null,
    review_assigned_to_id: null,
    review_assigned_at: null,
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
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  }),
  useUpdateApplication: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  }),
}));

vi.mock("@/features/notifications/view/partner-push-preferences", () => ({
  PushOptInCard: () => null,
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
  return render(withI18n(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>));
}

describe("Schedule auto-save behavior", () => {
  beforeEach(() => {
    push.mockReset();
  });

  const areas = [{ id: "area-1", label: "West Hyderabad" }];

  it("continues to the documents step with no changes", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderWithClient(
      <AvailabilityEditor
        areas={areas}
        initialPeriods={[]}
        onSave={onSave}
        backHref="/apply/work"
        nextHref="/apply/documents"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^Continue$/i }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/apply/documents");
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves edited hours before continuing", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderWithClient(
      <AvailabilityEditor
        areas={areas}
        initialPeriods={[]}
        onSave={onSave}
        backHref="/apply/work"
        nextHref="/apply/documents"
      />
    );

    const [mondaySetShift] = screen.getAllByRole("button", { name: /Set Shift/i });
    expect(mondaySetShift).toBeDefined();
    fireEvent.click(mondaySetShift as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: /Save Shift/i }));

    fireEvent.click(screen.getByRole("button", { name: /Save and Continue/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith("/apply/documents");
    });
  });
});

describe("ReviewStep working hours summary", () => {
  it("counts the areas that have hours", () => {
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

    expect(screen.getByText(/Hours set for 1 of 1 areas/i)).toBeDefined();
    expect(screen.getAllByText(/West Hyderabad/i).length).toBeGreaterThanOrEqual(1);
  });

  it("names missing hours as still needed and keeps Send disabled", () => {
    mockAvailability.data = {
      rules: [],
      exceptions: [],
    };

    renderWithClient(<ReviewStep />);

    expect(screen.getByText(/Hours set for 0 of 1 areas/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /Working hours/i })).toBeDefined();
    const send = screen.getByRole("button", { name: /Send application/i });
    expect(send).toHaveProperty("disabled", true);
  });
});
