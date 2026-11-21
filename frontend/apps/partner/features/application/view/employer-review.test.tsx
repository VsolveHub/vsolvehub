import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withI18n } from "@/i18n/test-utils";

/** The last step shows an employer what they gave, for their type, with a way back to each part. */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/apply/review",
}));

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

vi.mock("@/features/notifications/view/partner-push-preferences", () => ({ PushOptInCard: () => null }));
vi.mock("../reference-queries", () => ({
  useApplicationReference: () => ({
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    requiredConsents: [],
    serviceAreas: [],
    skills: [],
  }),
}));

const { ReviewStep } = await import("./review-step");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

const BUSINESS = {
  trade_name: "Sai Mobiles",
  legal_name: "Sri Sai Mobiles Pvt Ltd",
  legal_structure: "COMPANY",
  business_category: "SHOP",
  company_size: "SIZE_11_50",
  gst_registered: true,
  gstin: "27AAPFU0939F1ZV",
  business_proof_type: "GST_CERTIFICATE",
  address: "12 Main Road",
  area: "Kondapur",
  city: "Hyderabad",
  state: "Telangana",
  pin_code: "500084",
  latitude: "17.469000",
  longitude: "78.358000",
  logo_url: "",
  website_url: "",
};

function employer(overrides: Record<string, unknown> = {}) {
  return {
    hiring_as: "INDIVIDUAL",
    poster_role: "",
    id_document_type: "PAN",
    email: "",
    area: "Kondapur",
    city: "Hyderabad",
    pin_code: "500084",
    business: null,
    missing_fields: [],
    ...overrides,
  };
}

function application(overrides: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    partner_id: "p-1",
    status: "DRAFT",
    track: "EMPLOYER",
    version: 4,
    display_name: "Priya Sharma",
    biography: "",
    experience_years: 0,
    skill_codes: [],
    service_variant_ids: [],
    service_area_ids: [],
    consents: [],
    documents: [],
    transitions: [],
    can_edit: true,
    required_document_kinds: ["GOVERNMENT_ID", "SELFIE"],
    offered_document_kinds: ["GOVERNMENT_ID", "SELFIE"],
    consents_complete: false,
    employer: employer(),
    ...overrides,
  };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return withI18n(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

function serve(current: unknown) {
  client.GET.mockImplementation((path: string) =>
    Promise.resolve(path.includes("/availability/") ? ok({ rules: [], exceptions: [] }) : ok(current)),
  );
}

const editLinks = () =>
  screen.getAllByRole("link", { name: /^edit$/i }).map((link) => link.getAttribute("href"));

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => queryClient.clear());

describe("an individual employer's review", () => {
  it("says who is hiring and where they are, with a way back to each", async () => {
    serve(application());
    render(<ReviewStep />, { wrapper });

    expect(await screen.findByText("For myself or my home")).toBeInTheDocument();
    expect(screen.getByText("Priya Sharma · Kondapur, Hyderabad")).toBeInTheDocument();
    expect(editLinks()).toEqual(
      expect.arrayContaining(["/apply/hiring-as", "/apply/employer/about", "/apply/documents"]),
    );
    expect(editLinks()).not.toContain("/apply/about");
    expect(editLinks()).not.toContain("/apply/employer/business");
  });

  it("shows each document it will be asked for", async () => {
    serve(application());
    render(<ReviewStep />, { wrapper });

    expect(await screen.findByText(/A selfie: Not uploaded/i)).toBeInTheDocument();
  });
});

describe("a business employer's review", () => {
  const forBusiness = (extra: Record<string, unknown> = {}) =>
    application({
      required_document_kinds: ["GOVERNMENT_ID", "BUSINESS_PROOF", "AUTHORIZATION_LETTER"],
      employer: employer({ hiring_as: "BUSINESS", poster_role: "HR", business: BUSINESS }),
      ...extra,
    });

  it("summarises the business and who is posting for it", async () => {
    serve(forBusiness());
    render(<ReviewStep />, { wrapper });

    expect(await screen.findByText("For my business")).toBeInTheDocument();
    expect(screen.getByText("Sai Mobiles")).toBeInTheDocument();
    expect(screen.getByText("Shop · 11-50")).toBeInTheDocument();
    expect(screen.getByText("Kondapur, Hyderabad")).toBeInTheDocument();
    expect(screen.getByText("GSTIN 27AAPFU0939F1ZV")).toBeInTheDocument();
    expect(screen.getByText("Priya Sharma · HR / Recruiter")).toBeInTheDocument();
  });

  it("links to the business and contact screens, not the individual's", async () => {
    serve(forBusiness());
    render(<ReviewStep />, { wrapper });
    await screen.findByText("For my business");

    expect(editLinks()).toEqual(
      expect.arrayContaining([
        "/apply/hiring-as",
        "/apply/employer/business",
        "/apply/employer/contact",
        "/apply/documents",
      ]),
    );
    expect(editLinks()).not.toContain("/apply/employer/about");
  });

  it("says plainly when the business has no GST", async () => {
    serve(
      forBusiness({
        employer: employer({
          hiring_as: "BUSINESS",
          business: { ...BUSINESS, gst_registered: false, gstin: "", business_proof_type: "UDYAM" },
        }),
      }),
    );
    render(<ReviewStep />, { wrapper });

    expect(await screen.findByText("No GST")).toBeInTheDocument();
  });

  it("shows no links on an application that can no longer be edited", async () => {
    serve(forBusiness({ can_edit: false, status: "SUBMITTED" }));
    render(<ReviewStep />, { wrapper });

    expect(await screen.findByText("For my business")).toBeInTheDocument();
    expect(screen.queryAllByRole("link", { name: /^edit$/i })).toHaveLength(0);
  });
});

describe("everyone else's review", () => {
  it("keeps the single About you row", async () => {
    serve(
      application({
        track: "STAY_HOST",
        employer: null,
        required_document_kinds: ["GOVERNMENT_ID"],
      }),
    );
    render(<ReviewStep />, { wrapper });

    expect(await screen.findByText("About you")).toBeInTheDocument();
    expect(editLinks()).toContain("/apply/about");
    expect(screen.queryByText("Who is hiring")).not.toBeInTheDocument();
  });
});
