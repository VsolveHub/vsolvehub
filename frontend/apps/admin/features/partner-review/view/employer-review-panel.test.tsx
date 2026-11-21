import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What Operations sees of an employer, and the checks they tick before approving one.
 *
 * The server refuses an approval until every required check passes; the screen keeps the Approve
 * button honest about that, shows the hints the server sends, and lets only the reviewer holding
 * the application record a check, with a reason for a failed one.
 */

const ME = "11111111-1111-1111-1111-111111111111";
const COLLEAGUE = "22222222-2222-2222-2222-222222222222";

const api = vi.hoisted(() => {
  const puts: { path: string; params: unknown; body: unknown }[] = [];
  let application: Record<string, unknown> = {};
  const ok = (data: unknown) =>
    Promise.resolve({ data, error: undefined, response: new Response(null, { status: 200 }) });

  return {
    puts,
    setApplication: (next: Record<string, unknown>) => {
      application = next;
    },
    client: {
      GET: (path: string) =>
        path === "/api/v1/auth/session/"
          ? ok({
              user: { id: "11111111-1111-1111-1111-111111111111", roles: ["operations"] },
              active_role: "operations",
            })
          : ok(application),
      POST: () => ok(application),
      PUT: (path: string, init: { params: unknown; body: unknown }) => {
        puts.push({ path, params: init.params, body: init.body });
        return ok([]);
      },
    },
  };
});

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => api.client }));

const { ReviewDetail } = await import("./review-detail");

const CHECK_LABELS = {
  NAME_MATCHES_ID: "The name on the ID matches the name they gave",
  SELFIE_MATCHES_ID: "The selfie is the same person as the ID photo",
  GST_ACTIVE_ON_PORTAL: "GSTIN is Active on the GST portal and the legal name matches",
  PROOF_MATCHES_BUSINESS: "The business proof shows the same legal name and isn't edited",
  POSTER_ID_MATCHES: "The poster's ID matches the name they gave",
  AUTHORITY_CONFIRMED: "Owner: ID name matches the business owner. Others: the owner's letter is valid",
} as const;

function check(code: keyof typeof CHECK_LABELS, result: "PASS" | "FAIL" | null = null, note = "") {
  return {
    code,
    label: CHECK_LABELS[code],
    result,
    note,
    checked_by_name: result ? "Operations Reviewer" : "",
    checked_at: result ? "2026-11-20T10:00:00Z" : null,
  };
}

function document(kind: string, status = "APPROVED") {
  return {
    id: `doc-${kind}`,
    kind,
    status,
    version: 1,
    content_type: "image/jpeg",
    size_bytes: 1000,
    sha256: "0".repeat(64),
    scan_status: "CLEAN",
    scanned_at: "2026-11-20T09:00:00Z",
    uploaded_at: "2026-11-20T09:00:00Z",
    reviewed_at: null,
    review_reason: "",
    file_name: `${kind.toLowerCase()}_v1.jpg`,
    can_replace: false,
  };
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
  website_url: "https://sai.example",
};

function businessApplication(overrides: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    display_name: "Asha Rao",
    biography: "",
    experience_years: 0,
    track: "EMPLOYER",
    status: "UNDER_REVIEW",
    version: 4,
    review_assigned_to_id: ME,
    consents: [],
    transitions: [],
    documents: [document("GOVERNMENT_ID"), document("BUSINESS_PROOF")],
    employer: {
      hiring_as: "BUSINESS",
      poster_role: "OWNER",
      id_document_type: "PAN",
      email: "asha@example.com",
      area: "",
      city: "",
      pin_code: "",
      business: BUSINESS,
      missing_fields: [],
    },
    employer_hints: [
      { code: "GSTIN_STATE_MISMATCH", level: "WARN", message: "The GSTIN is for Maharashtra, but the state given is Telangana." },
      { code: "DUPLICATE_GSTIN", level: "OK", message: "No other business uses this GSTIN." },
    ],
    employer_checks: [
      check("GST_ACTIVE_ON_PORTAL"),
      check("PROOF_MATCHES_BUSINESS"),
      check("POSTER_ID_MATCHES"),
      check("AUTHORITY_CONFIRMED"),
    ],
    ...overrides,
  };
}

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ReviewDetail applicationId="app-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.puts.length = 0;
});

describe("a business employer's details", () => {
  it("shows who they are, the GST details and the map link", async () => {
    api.setApplication(businessApplication());
    renderDetail();

    expect(await screen.findByText("Employer details")).toBeInTheDocument();
    expect(screen.getByText("Business")).toBeInTheDocument();
    expect(screen.getByText("Sai Mobiles")).toBeInTheDocument();
    expect(screen.getByText("Sri Sai Mobiles Pvt Ltd")).toBeInTheDocument();
    expect(screen.getByText("Company")).toBeInTheDocument();
    expect(screen.getByText("Shop / retail · 11-50 staff")).toBeInTheDocument();
    expect(screen.getByText("12 Main Road, Kondapur, Hyderabad, Telangana, 500084")).toBeInTheDocument();
    expect(screen.getByText("Owner / Partner / Director")).toBeInTheDocument();
    expect(screen.getByText("PAN card")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view on map/i })).toHaveAttribute(
      "href",
      "https://www.google.com/maps?q=17.469000,78.358000",
    );
  });

  it("gives the GSTIN a copy button and a link to the GST portal search", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    api.setApplication(businessApplication());
    renderDetail();

    expect(await screen.findByText("27AAPFU0939F1ZV")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open gst portal search/i })).toHaveAttribute(
      "href",
      "https://services.gst.gov.in/services/searchtp",
    );

    fireEvent.click(screen.getByRole("button", { name: /copy gstin/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("27AAPFU0939F1ZV"));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("says plainly when there is no GST", async () => {
    api.setApplication(
      businessApplication({
        employer: {
          ...businessApplication().employer,
          business: { ...BUSINESS, gst_registered: false, gstin: "", business_proof_type: "UDYAM" },
        },
      }),
    );
    renderDetail();

    expect(await screen.findByText("No GST")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open gst portal search/i })).toBeNull();
    expect(screen.getByText("Udyam registration")).toBeInTheDocument();
  });

  it("lists what the platform noticed, warnings and all-clears alike", async () => {
    api.setApplication(businessApplication());
    renderDetail();

    expect(
      await screen.findByText("The GSTIN is for Maharashtra, but the state given is Telangana."),
    ).toBeInTheDocument();
    expect(screen.getByText("No other business uses this GSTIN.")).toBeInTheDocument();
  });
});

describe("an individual employer's details", () => {
  it("shows a location and no business or GST section", async () => {
    api.setApplication(
      businessApplication({
        documents: [document("GOVERNMENT_ID"), document("SELFIE")],
        employer: {
          hiring_as: "INDIVIDUAL",
          poster_role: "",
          id_document_type: "AADHAAR_MASKED",
          email: "",
          area: "Kondapur",
          city: "Hyderabad",
          pin_code: "500084",
          business: null,
          missing_fields: [],
        },
        employer_hints: [],
        employer_checks: [check("NAME_MATCHES_ID"), check("SELFIE_MATCHES_ID")],
      }),
    );
    renderDetail();

    expect(await screen.findByText("Individual")).toBeInTheDocument();
    expect(screen.getByText("Kondapur, Hyderabad, 500084")).toBeInTheDocument();
    expect(screen.getByText("Masked Aadhaar")).toBeInTheDocument();
    expect(screen.queryByText("Legal name")).toBeNull();
    expect(screen.queryByText("GST")).toBeNull();
    expect(screen.queryByText("What we noticed")).toBeNull();
  });
});

describe("the checklist", () => {
  it("lists every check the server requires, with how many have passed", async () => {
    api.setApplication(
      businessApplication({
        employer_checks: [
          check("GST_ACTIVE_ON_PORTAL", "PASS"),
          check("PROOF_MATCHES_BUSINESS"),
          check("POSTER_ID_MATCHES"),
          check("AUTHORITY_CONFIRMED"),
        ],
      }),
    );
    renderDetail();

    expect(await screen.findByText("1 of 4 passed")).toBeInTheDocument();
    expect(screen.getByText(CHECK_LABELS.GST_ACTIVE_ON_PORTAL)).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getAllByText("Not checked")).toHaveLength(3);
    expect(screen.getByText(/Operations Reviewer/)).toBeInTheDocument();
  });

  it("passes a check straight away", async () => {
    api.setApplication(businessApplication());
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: `Pass: ${CHECK_LABELS.POSTER_ID_MATCHES}` }));

    await waitFor(() =>
      expect(api.puts).toContainEqual({
        path: "/api/v1/operations/partner-applications/{application_id}/employer-checks/{code}/",
        params: { path: { application_id: "app-1", code: "POSTER_ID_MATCHES" } },
        body: { result: "PASS", note: "" },
      }),
    );
  });

  it("will not record a failed check without a reason", async () => {
    api.setApplication(businessApplication());
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: `Fail: ${CHECK_LABELS.PROOF_MATCHES_BUSINESS}` }));

    const record = await screen.findByRole("button", { name: "Record fail" });
    expect(record).toBeDisabled();
    expect(api.puts).toHaveLength(0);

    fireEvent.change(screen.getByLabelText(/why did it fail/i), {
      target: { value: "  The proof names a different business.  " },
    });
    expect(record).toBeEnabled();
    fireEvent.click(record);

    await waitFor(() =>
      expect(api.puts).toContainEqual({
        path: "/api/v1/operations/partner-applications/{application_id}/employer-checks/{code}/",
        params: { path: { application_id: "app-1", code: "PROOF_MATCHES_BUSINESS" } },
        body: { result: "FAIL", note: "The proof names a different business." },
      }),
    );
  });

  it("shows why a check failed", async () => {
    api.setApplication(
      businessApplication({
        employer_checks: [
          check("GST_ACTIVE_ON_PORTAL", "FAIL", "Cancelled on the portal."),
          check("PROOF_MATCHES_BUSINESS"),
        ],
      }),
    );
    renderDetail();

    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Cancelled on the portal.")).toBeInTheDocument();
  });

  it("is read-only for a reviewer who does not hold the application", async () => {
    api.setApplication(businessApplication({ review_assigned_to_id: COLLEAGUE }));
    renderDetail();

    expect(await screen.findByText(/claim this application to record the checks/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Pass: ${CHECK_LABELS.POSTER_ID_MATCHES}` })).toBeDisabled();
    expect(screen.getByRole("button", { name: `Fail: ${CHECK_LABELS.POSTER_ID_MATCHES}` })).toBeDisabled();
  });

  it("is not shown for anyone but an employer", async () => {
    api.setApplication({
      ...businessApplication(),
      track: "STAY_HOST",
      employer: null,
      employer_hints: [],
      employer_checks: [],
    });
    renderDetail();

    expect(await screen.findByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.queryByText("Employer checklist")).toBeNull();
    expect(screen.queryByText("Employer details")).toBeNull();
  });
});

describe("approving an employer", () => {
  it("is off, and says why, until every check has passed", async () => {
    api.setApplication(
      businessApplication({
        employer_checks: [
          check("GST_ACTIVE_ON_PORTAL", "PASS"),
          check("PROOF_MATCHES_BUSINESS", "PASS"),
          check("POSTER_ID_MATCHES", "PASS"),
          check("AUTHORITY_CONFIRMED"),
        ],
      }),
    );
    renderDetail();

    const approve = await screen.findByRole("button", { name: "Approve" });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAttribute("title", "Finish the checklist first.");
    const decision = screen.getByRole("heading", { name: "Decision" }).closest("div")!;
    expect(within(decision).getByText("Finish the checklist first.")).toBeInTheDocument();
  });

  it("stays off while a check has failed", async () => {
    api.setApplication(
      businessApplication({
        employer_checks: [
          check("GST_ACTIVE_ON_PORTAL", "PASS"),
          check("PROOF_MATCHES_BUSINESS", "FAIL", "Edited."),
          check("POSTER_ID_MATCHES", "PASS"),
          check("AUTHORITY_CONFIRMED", "PASS"),
        ],
      }),
    );
    renderDetail();

    expect(await screen.findByRole("button", { name: "Approve" })).toBeDisabled();
  });

  it("is on once every check has passed and the documents are approved", async () => {
    api.setApplication(
      businessApplication({
        employer_checks: [
          check("GST_ACTIVE_ON_PORTAL", "PASS"),
          check("PROOF_MATCHES_BUSINESS", "PASS"),
          check("POSTER_ID_MATCHES", "PASS"),
          check("AUTHORITY_CONFIRMED", "PASS"),
        ],
      }),
    );
    renderDetail();

    expect(await screen.findByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.queryByText("Finish the checklist first.")).toBeNull();
  });

  it("is never held back for anyone who is not an employer", async () => {
    api.setApplication({
      ...businessApplication(),
      track: "RENTAL_OWNER",
      documents: [document("GOVERNMENT_ID")],
      employer: null,
      employer_hints: [],
      employer_checks: [],
    });
    renderDetail();

    expect(await screen.findByRole("button", { name: "Approve" })).toBeEnabled();
  });
});
