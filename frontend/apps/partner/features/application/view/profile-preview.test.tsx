import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { withI18n } from "@/i18n/test-utils";

const hooks = vi.hoisted(() => ({
  application: vi.fn(),
  availability: vi.fn(),
  reference: vi.fn(),
}));

vi.mock("../queries", () => ({
  usePartnerApplication: hooks.application,
  usePartnerAvailability: hooks.availability,
}));
vi.mock("../reference-queries", () => ({ useApplicationReference: hooks.reference }));
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => ({}) }));
vi.mock("@vsolve/query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vsolve/query")>()),
  useCurrentSession: () => ({ data: { user: { phone_number: "+919900000099" } } }),
}));

const { ProfilePreview } = await import("./profile-preview");

const APPLICATION = {
  status: "DRAFT",
  track: "SERVICES",
  version: 3,
  display_name: "Ravi Kumar",
  biography: "Electrician for 8 years.",
  skill_codes: ["ELECTRICAL"],
  service_variant_ids: ["v1"],
  service_area_ids: ["a1"],
  documents: [],
  consents: [
    { id: "c1", purpose: "PARTNER_TERMS", document_version: "1", accepted_at: "2026-11-10T06:00:00Z", withdrawn_at: null },
  ],
  required_document_kinds: ["GOVERNMENT_ID"],
  can_edit: true,
  submitted_at: null,
};

const SERVICES = [{ variantId: "v1", serviceName: "Fan repair", variantName: "Ceiling fan" }] as never;

function given(application: object) {
  hooks.application.mockReturnValue(application);
  hooks.reference.mockReturnValue({
    serviceAreas: [{ id: "a1", name: "Alappuzha" }],
    skills: [{ id: "s1", code: "ELECTRICAL", name: "Electrical", description: "" }],
    requiredConsents: [{ purpose: "PARTNER_TERMS", title: "Partner terms", document_version: "1" }],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  hooks.availability.mockReturnValue({
    isPending: false,
    isError: false,
    data: {
      rules: [
        { id: "r1", service_area_id: "a1", weekday: 0, starts_at: "09:00:00", ends_at: "18:00:00", ends_next_day: false, is_active: true },
      ],
      exceptions: [],
    },
  });
}

describe("ProfilePreview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the loading state", () => {
    given({ isPending: true, isError: false, data: undefined, error: null });
    render(withI18n(<ProfilePreview services={SERVICES} />));
    expect(screen.getByLabelText("Loading your application summary…")).toBeInTheDocument();
  });

  it("shows the error state", () => {
    given({ isPending: false, isError: true, data: undefined, error: new Error("offline"), refetch: vi.fn() });
    render(withI18n(<ProfilePreview services={SERVICES} />));
    expect(screen.getByText("We could not load your application")).toBeInTheDocument();
  });

  it("shows the status and every step of a services application with edit links", () => {
    given({ isPending: false, isError: false, data: APPLICATION, error: null });
    render(withI18n(<ProfilePreview services={SERVICES} />));

    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText(/\+919900000099/)).toBeInTheDocument();
    expect(screen.getByText("Electrical")).toBeInTheDocument();
    expect(screen.getByText("Fan repair · Ceiling fan")).toBeInTheDocument();
    expect(screen.getByText("Alappuzha", { selector: "li" })).toBeInTheDocument();
    expect(screen.getByText("09:00 – 18:00")).toBeInTheDocument();
    expect(screen.getByText("Not uploaded")).toBeInTheDocument();
    expect(screen.getByText("Partner terms")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^Edit/ })).toHaveLength(6);
  });

  it("hides edit links once the application is sent", () => {
    given({
      isPending: false,
      isError: false,
      data: { ...APPLICATION, status: "SUBMITTED", can_edit: false, submitted_at: "2026-11-18T03:09:00Z" },
      error: null,
    });
    render(withI18n(<ProfilePreview services={SERVICES} />));
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.queryAllByRole("link", { name: /^Edit/ })).toHaveLength(0);
  });
});
