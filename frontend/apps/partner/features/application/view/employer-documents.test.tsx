import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withI18n } from "@/i18n/test-utils";

/**
 * What the documents step asks of each kind of applicant: the slots come from the server's list,
 * an employer's are named for what they prove, and a selfie is a photo taken with the front camera.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/apply/documents",
}));

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { DocumentsStep } = await import("./documents-step");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

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
    documents: [],
    transitions: [],
    consents: [],
    can_edit: true,
    required_document_kinds: ["GOVERNMENT_ID", "SELFIE"],
    offered_document_kinds: ["GOVERNMENT_ID", "SELFIE"],
    employer: employer(),
    ...overrides,
  };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return withI18n(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

beforeEach(() => {
  push.mockReset();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => queryClient.clear());

function serve(current: unknown) {
  client.GET.mockResolvedValue(ok(current));
}

describe("an individual employer's documents", () => {
  it("asks for their ID and a selfie, named for what they prove", async () => {
    serve(application());
    render(<DocumentsStep />, { wrapper });

    expect(await screen.findByText("Your ID")).toBeInTheDocument();
    expect(screen.getByText("A selfie")).toBeInTheDocument();
    expect(screen.queryByText("Proof of address")).not.toBeInTheDocument();
    expect(screen.getByText("So candidates know a real person is hiring.")).toBeInTheDocument();
    expect(
      screen.getByText("We match it with your ID photo. Face the camera in good light."),
    ).toBeInTheDocument();
  });

  it("shows which ID they said they would upload", async () => {
    serve(application());
    render(<DocumentsStep />, { wrapper });

    expect(await screen.findByText("ID type: PAN card")).toBeInTheDocument();
    expect(screen.queryByText(/masked aadhaar: only the last 4 digits/i)).not.toBeInTheDocument();
  });

  it("explains a masked Aadhaar when that is the ID", async () => {
    serve(application({ employer: employer({ id_document_type: "AADHAAR_MASKED" }) }));
    render(<DocumentsStep />, { wrapper });

    expect(await screen.findByText("ID type: Masked Aadhaar")).toBeInTheDocument();
    expect(screen.getByText(/only the last 4 digits are visible/i)).toBeInTheDocument();
    expect(screen.getByText(/don't upload a full aadhaar number/i)).toBeInTheDocument();
  });

  it("takes the selfie with the front camera and offers photos only", async () => {
    serve(application());
    render(<DocumentsStep />, { wrapper });
    await screen.findByText("A selfie");

    const selfie = document.querySelector<HTMLInputElement>("#upload-selfie");
    expect(selfie).not.toBeNull();
    expect(selfie?.getAttribute("accept")).toBe("image/jpeg,image/png");
    expect(selfie?.getAttribute("capture")).toBe("user");

    const id = document.querySelector<HTMLInputElement>("#upload-government_id");
    expect(id?.getAttribute("accept")).toContain("application/pdf");
    expect(id?.getAttribute("capture")).toBeNull();
  });

  it("refuses a PDF selfie before sending a byte", async () => {
    serve(application());
    render(<DocumentsStep />, { wrapper });
    await screen.findByText("A selfie");

    const selfie = document.querySelector<HTMLInputElement>("#upload-selfie")!;
    fireEvent.change(selfie, {
      target: { files: [new File(["%PDF-1.4"], "selfie.pdf", { type: "application/pdf" })] },
    });

    expect(await screen.findByText("A selfie must be a JPG or PNG photo.")).toBeInTheDocument();
    expect(client.POST).not.toHaveBeenCalled();
  });

  it("goes on to the review", async () => {
    serve(application());
    render(<DocumentsStep />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /^continue$/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/apply/review"));
  });
});

describe("a business employer's documents", () => {
  const business = {
    trade_name: "",
    legal_name: "Sri Sai Mobiles Pvt Ltd",
    business_proof_type: "UDYAM",
  };
  const forBusiness = (extra: Record<string, unknown> = {}) =>
    application({
      required_document_kinds: ["GOVERNMENT_ID", "BUSINESS_PROOF", "AUTHORIZATION_LETTER"],
      offered_document_kinds: ["GOVERNMENT_ID", "BUSINESS_PROOF", "AUTHORIZATION_LETTER"],
      employer: employer({ hiring_as: "BUSINESS", poster_role: "HR", business }),
      ...extra,
    });

  it("names the proof by its type and asks the non-owner for the owner's letter", async () => {
    serve(forBusiness());
    render(<DocumentsStep />, { wrapper });

    expect(await screen.findByText("Business proof: Udyam registration")).toBeInTheDocument();
    expect(screen.getByText("Letter from the owner")).toBeInTheDocument();
    expect(screen.queryByText("A selfie")).not.toBeInTheDocument();
    expect(
      screen.getByText("So candidates know the business is real. The name must match the legal name you gave."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("On business letterhead, signed by the owner, naming you as the person hiring."),
    ).toBeInTheDocument();
  });

  it("asks an owner for no letter, because the server does not list one", async () => {
    serve(
      forBusiness({
        required_document_kinds: ["GOVERNMENT_ID", "BUSINESS_PROOF"],
        offered_document_kinds: ["GOVERNMENT_ID", "BUSINESS_PROOF"],
      }),
    );
    render(<DocumentsStep />, { wrapper });

    await screen.findByText("Business proof: Udyam registration");
    expect(screen.queryByText("Letter from the owner")).not.toBeInTheDocument();
  });

  it("still names the proof plainly before one is chosen", async () => {
    serve(forBusiness({ employer: employer({ hiring_as: "BUSINESS", business: { ...business, business_proof_type: "" } }) }));
    render(<DocumentsStep />, { wrapper });

    expect(await screen.findByText("Business proof")).toBeInTheDocument();
  });
});

describe("everyone else's documents", () => {
  it("keep their ID and proof of address, as before", async () => {
    serve(
      application({
        track: "STAY_HOST",
        employer: null,
        required_document_kinds: ["GOVERNMENT_ID"],
        offered_document_kinds: ["GOVERNMENT_ID", "ADDRESS_PROOF"],
      }),
    );
    render(<DocumentsStep />, { wrapper });

    expect(await screen.findByText("Government photo ID")).toBeInTheDocument();
    expect(screen.getByText("Proof of address")).toBeInTheDocument();
    expect(screen.queryByText("A selfie")).not.toBeInTheDocument();
    expect(document.querySelector("#upload-government_id")?.getAttribute("capture")).toBeNull();
  });
});
