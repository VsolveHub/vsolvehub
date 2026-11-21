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
    // Progress, from the same helper as the overview checklist.
    // The ring and the step marks show no words, so check what a screen reader hears.
    expect(screen.getByRole("img", { name: /^\d+ of \d+ steps complete$/ })).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Done" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("img", { name: /needed$/ }).length).toBeGreaterThan(0);
    expect(screen.queryByText("Done")).toBeNull();
    expect(screen.getByText("Partner terms")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^Edit/ })).toHaveLength(6);
  });

  it("shows a business employer's own steps, read from the application", () => {
    given({
      isPending: false,
      isError: false,
      data: {
        ...APPLICATION,
        track: "EMPLOYER",
        display_name: "Asha Rao",
        required_document_kinds: ["GOVERNMENT_ID", "BUSINESS_PROOF"],
        employer: {
          hiring_as: "BUSINESS",
          poster_role: "OWNER",
          id_document_type: "PAN",
          email: "asha@example.com",
          area: "",
          city: "",
          pin_code: "",
          missing_fields: [],
          business: {
            trade_name: "Sai Mobiles",
            legal_name: "Sri Sai Mobiles Pvt Ltd",
            legal_structure: "COMPANY",
            business_category: "SHOP",
            company_size: "SIZE_11_50",
            gst_registered: false,
            gstin: "",
            business_proof_type: "UDYAM",
            address: "12 Main Road",
            area: "Kondapur",
            city: "Hyderabad",
            state: "Telangana",
            pin_code: "500084",
            latitude: "17.469000",
            longitude: "78.358000",
            logo_url: "",
            website_url: "https://sai.example",
          },
        },
      },
      error: null,
    });
    render(withI18n(<ProfilePreview services={SERVICES} />));

    for (const heading of ["Who is hiring", "Your business", "You and your role"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    expect(screen.queryByRole("heading", { name: "Your details" })).toBeNull();
    expect(screen.getByText("For my business")).toBeInTheDocument();
    expect(screen.getByText("Sri Sai Mobiles Pvt Ltd")).toBeInTheDocument();
    expect(screen.getByText("Udyam registration")).toBeInTheDocument();
    expect(screen.getByText("No GST")).toBeInTheDocument();
    expect(screen.getByText("12 Main Road, Kondapur, Hyderabad, Telangana, 500084")).toBeInTheDocument();
    expect(screen.getByText("Owner / Partner / Director")).toBeInTheDocument();
    expect(screen.getByText("PAN card")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^Edit/ })).toHaveLength(5);
  });

  it("shows an individual employer their own details only", () => {
    given({
      isPending: false,
      isError: false,
      data: {
        ...APPLICATION,
        track: "EMPLOYER",
        display_name: "Priya Sharma",
        required_document_kinds: ["GOVERNMENT_ID", "SELFIE"],
        employer: {
          hiring_as: "INDIVIDUAL",
          poster_role: "",
          id_document_type: "PAN",
          email: "",
          area: "Kondapur",
          city: "Hyderabad",
          pin_code: "500084",
          business: null,
          missing_fields: [],
        },
      },
      error: null,
    });
    render(withI18n(<ProfilePreview services={SERVICES} />));

    expect(screen.getByRole("heading", { name: "Your details" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your business" })).toBeNull();
    expect(screen.getByText("For myself or my home")).toBeInTheDocument();
    expect(screen.getByText("Kondapur")).toBeInTheDocument();
    expect(screen.getByText("500084")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^Edit/ })).toHaveLength(4);
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
