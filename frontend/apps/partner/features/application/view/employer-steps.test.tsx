import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withI18n } from "@/i18n/test-utils";

/**
 * The employer screens: who is hiring, an individual's details, a business's details and the
 * person posting for it. Each must refuse to go on until its required answers are given, send only
 * what the server accepts, and keep an applicant on the screens that belong to their type.
 */

const push = vi.fn();
const replace = vi.fn();
let pathname = "/apply/hiring-as";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => pathname,
}));

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

vi.mock("@/features/location/view/find-on-map", () => ({
  FindOnMap: () => <button type="button">Find on map</button>,
}));

const { HiringAsStep } = await import("./hiring-as-step");
const { EmployerAboutStep } = await import("./employer-about-step");
const { EmployerBusinessStep } = await import("./employer-business-step");
const { EmployerContactStep } = await import("./employer-contact-step");

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function employer(overrides: Record<string, unknown> = {}) {
  return {
    hiring_as: "",
    poster_role: "",
    id_document_type: "",
    email: "",
    area: "",
    city: "",
    pin_code: "",
    business: null,
    missing_fields: ["hiring_as"],
    ...overrides,
  };
}

function business(overrides: Record<string, unknown> = {}) {
  return {
    trade_name: "",
    legal_name: "",
    legal_structure: "",
    business_category: "",
    company_size: "",
    gst_registered: false,
    gstin: "",
    business_proof_type: "",
    address: "",
    area: "",
    city: "",
    state: "Telangana",
    pin_code: "",
    latitude: null,
    longitude: null,
    logo_url: "",
    website_url: "",
    ...overrides,
  };
}

function application(employerValue: unknown, overrides: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    partner_id: "p-1",
    status: "DRAFT",
    track: "EMPLOYER",
    version: 3,
    display_name: "",
    biography: "",
    experience_years: 0,
    skill_codes: [],
    service_variant_ids: [],
    service_area_ids: [],
    consents: [],
    documents: [],
    transitions: [],
    can_edit: true,
    required_document_kinds: ["GOVERNMENT_ID"],
    offered_document_kinds: ["GOVERNMENT_ID"],
    consents_complete: false,
    business_details_complete: false,
    change_request_message: "",
    submitted_at: null,
    reviewed_at: null,
    review_assigned_at: null,
    review_assigned_to_id: null,
    created_at: "2026-08-01T09:00:00Z",
    updated_at: "2026-08-01T09:00:00Z",
    employer: employerValue,
    ...overrides,
  };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return withI18n(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

/** The server holds `current`; the sign-up name is Priya Sharma. */
function serve(current: unknown) {
  client.GET.mockImplementation((path: string) =>
    Promise.resolve(path.includes("/auth/profile/") ? ok({ full_name: "Priya Sharma" }) : ok(current)),
  );
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
  }
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const method of Object.values(client)) method.mockReset();
});

afterEach(() => {
  queryClient.clear();
});

const continueButton = () => screen.getByRole("button", { name: /^continue$/i });

describe("Who is hiring", () => {
  beforeEach(() => {
    pathname = "/apply/hiring-as";
  });

  it("saves the choice and moves to the screens for that type", async () => {
    serve(application(employer()));
    client.PATCH.mockResolvedValue(
      ok(application(employer({ hiring_as: "BUSINESS", missing_fields: ["legal_name"] }), { version: 4 })),
    );
    render(<HiringAsStep />, { wrapper });

    fireEvent.click(await screen.findByRole("radio", { name: /for my business/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/apply/employer/business"));
    expect(client.PATCH).toHaveBeenCalledWith(
      "/api/v1/partner/application/employer/",
      expect.objectContaining({ body: expect.objectContaining({ hiring_as: "BUSINESS", expected_version: 3 }) }),
    );
  });

  it("offers no agency option, only a note that agencies are not supported", async () => {
    serve(application(employer()));
    render(<HiringAsStep />, { wrapper });

    expect(await screen.findAllByRole("radio")).toHaveLength(2);
    expect(screen.getByText(/we don't support agencies yet/i)).toBeInTheDocument();
  });

  it("goes on without saving when the chosen type is chosen again", async () => {
    serve(application(employer({ hiring_as: "INDIVIDUAL", missing_fields: [] })));
    render(<HiringAsStep />, { wrapper });

    fireEvent.click(await screen.findByRole("radio", { name: /for myself or my home/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/apply/employer/about"));
    expect(client.PATCH).not.toHaveBeenCalled();
  });

  it("switches at once when nothing has been typed for the other type", async () => {
    serve(application(employer({ hiring_as: "INDIVIDUAL", missing_fields: ["area"] })));
    client.PATCH.mockResolvedValue(ok(application(employer({ hiring_as: "BUSINESS" }), { version: 4 })));
    render(<HiringAsStep />, { wrapper });

    fireEvent.click(await screen.findByRole("radio", { name: /for my business/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/apply/employer/business"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks first when switching would clear what was typed, and does nothing until they agree", async () => {
    serve(application(employer({ hiring_as: "INDIVIDUAL", area: "Kondapur", missing_fields: [] })));
    client.PATCH.mockResolvedValue(ok(application(employer({ hiring_as: "BUSINESS" }), { version: 4 })));
    render(<HiringAsStep />, { wrapper });

    fireEvent.click(await screen.findByRole("radio", { name: /for my business/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/switch to for my business\?/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/the details you entered for for myself or my home will be cleared/i),
    ).toBeInTheDocument();
    expect(client.PATCH).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: /^cancel$/i }));
    expect(client.PATCH).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("radio", { name: /for my business/i }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^switch$/i }));

    await waitFor(() => expect(client.PATCH).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/apply/employer/business"));
  });

  it("shows the choice locked, and saves nothing, on an application that can no longer be edited", async () => {
    serve(application(employer({ hiring_as: "BUSINESS" }), { can_edit: false, status: "SUBMITTED" }));
    render(<HiringAsStep />, { wrapper });

    expect(await screen.findByRole("radio", { name: /for my business/i })).toBeDisabled();
    expect(client.PATCH).not.toHaveBeenCalled();
  });

  it("sends someone who is not an employer back to the overview", async () => {
    serve(application(employer(), { track: "SERVICES" }));
    render(<HiringAsStep />, { wrapper });

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/apply"));
  });
});

describe("An individual's details", () => {
  beforeEach(() => {
    pathname = "/apply/employer/about";
  });

  const savedIndividual = () =>
    application(
      employer({
        hiring_as: "INDIVIDUAL",
        area: "Kondapur",
        city: "Hyderabad",
        pin_code: "500084",
        id_document_type: "PAN",
        missing_fields: ["display_name"],
      }),
      { display_name: "Priya Sharma" },
    );

  it("offers the sign-up name and will not continue until the required answers are given", async () => {
    serve(application(employer({ hiring_as: "INDIVIDUAL", missing_fields: ["area"] })));
    render(<EmployerAboutStep />, { wrapper });

    const name = await screen.findByLabelText(/your full name/i);
    await waitFor(() => expect(name).toHaveValue("Priya Sharma"));
    expect(continueButton()).toBeDisabled();
  });

  it("says what is wrong with a pin code and keeps Continue off", async () => {
    serve(savedIndividual());
    render(<EmployerAboutStep />, { wrapper });

    fireEvent.change(await screen.findByLabelText(/pin code/i), { target: { value: "01234" } });

    expect(await screen.findByText(/enter a 6-digit pin code/i)).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();
  });

  it("only keeps digits in the pin code", async () => {
    serve(savedIndividual());
    render(<EmployerAboutStep />, { wrapper });

    const pin = await screen.findByLabelText(/pin code/i);
    fireEvent.change(pin, { target: { value: "5a0b0084" } });

    expect(pin).toHaveValue("500084");
  });

  it("saves what changed and moves on to the documents", async () => {
    serve(savedIndividual());
    client.PATCH.mockResolvedValue(ok(application(employer({ hiring_as: "INDIVIDUAL" }), { version: 4 })));
    render(<EmployerAboutStep />, { wrapper });

    fireEvent.change(await screen.findByLabelText(/^area/i), { target: { value: "Madhapur" } });
    fireEvent.click(continueButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/apply/documents"));
    expect(client.PATCH).toHaveBeenCalledWith(
      "/api/v1/partner/application/employer/",
      expect.objectContaining({
        body: expect.objectContaining({
          expected_version: 3,
          display_name: "Priya Sharma",
          area: "Madhapur",
          pin_code: "500084",
          id_document_type: "PAN",
        }),
      }),
    );
  });

  it("moves on without a request when nothing changed", async () => {
    serve(
      application(
        employer({
          hiring_as: "INDIVIDUAL",
          area: "Kondapur",
          city: "Hyderabad",
          pin_code: "500084",
          id_document_type: "PAN",
          missing_fields: [],
        }),
        { display_name: "Priya Sharma" },
      ),
    );
    render(<EmployerAboutStep />, { wrapper });

    await screen.findByLabelText(/your full name/i);
    fireEvent.click(continueButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/apply/documents"));
    expect(client.PATCH).not.toHaveBeenCalled();
  });

  it("stays put and says so when the save is refused", async () => {
    serve(savedIndividual());
    client.PATCH.mockResolvedValue({
      data: undefined,
      error: {
        error: { code: "validation_error", message: "Refused.", details: null, retryable: false, request_id: "r" },
      },
      response: new Response(null, { status: 400 }),
    });
    render(<EmployerAboutStep />, { wrapper });

    fireEvent.change(await screen.findByLabelText(/^area/i), { target: { value: "Madhapur" } });
    fireEvent.click(continueButton());

    expect(await screen.findByText(/could not save/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("sends a business to its own screen, and someone who has not chosen to the choice", async () => {
    serve(application(employer({ hiring_as: "BUSINESS" })));
    const first = render(<EmployerAboutStep />, { wrapper });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/apply/employer/business"));
    first.unmount();

    replace.mockReset();
    queryClient.clear();
    serve(application(employer()));
    render(<EmployerAboutStep />, { wrapper });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/apply/hiring-as"));
  });

  it("locks the fields and only moves on when the application can no longer be edited", async () => {
    serve({ ...savedIndividual(), can_edit: false, status: "SUBMITTED" });
    render(<EmployerAboutStep />, { wrapper });

    expect(await screen.findByLabelText(/^area/i)).toBeDisabled();
    fireEvent.click(continueButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/apply/documents"));
    expect(client.PATCH).not.toHaveBeenCalled();
  });
});

describe("The business's details", () => {
  beforeEach(() => {
    pathname = "/apply/employer/business";
  });

  const savedBusiness = (overrides: Record<string, unknown> = {}) =>
    application(
      employer({
        hiring_as: "BUSINESS",
        missing_fields: [],
        business: business({
          legal_name: "Sri Sai Mobiles Pvt Ltd",
          legal_structure: "COMPANY",
          business_category: "SHOP",
          company_size: "SIZE_1_10",
          business_proof_type: "SHOP_ESTABLISHMENT",
          address: "12 Main Road",
          area: "Kondapur",
          city: "Hyderabad",
          pin_code: "500084",
          latitude: "17.469000",
          longitude: "78.358000",
          ...overrides,
        }),
      }),
    );

  it("cannot continue from an empty business, and asks for the map pin", async () => {
    serve(application(employer({ hiring_as: "BUSINESS", business: business() })));
    render(<EmployerBusinessStep />, { wrapper });

    await screen.findByLabelText(/legal name of the business/i);
    expect(continueButton()).toBeDisabled();
    expect(screen.getByText(/pin your business on the map to continue/i)).toBeInTheDocument();
  });

  it("shows neither GST answer for a new business, and nothing about GSTIN until yes", async () => {
    serve(application(employer({ hiring_as: "BUSINESS", business: business() })));
    render(<EmployerBusinessStep />, { wrapper });

    await screen.findByLabelText(/legal name of the business/i);
    const group = screen.getByRole("radiogroup", { name: /do you have gst/i });
    expect(within(group).getByRole("radio", { name: /^yes$/i })).not.toBeChecked();
    expect(within(group).getByRole("radio", { name: /^no$/i })).not.toBeChecked();
    expect(screen.queryByLabelText(/^gstin/i)).not.toBeInTheDocument();
  });

  it("checks the GSTIN as it is typed and names what is wrong", async () => {
    serve(savedBusiness());
    render(<EmployerBusinessStep />, { wrapper });

    await screen.findByLabelText(/legal name of the business/i);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: /do you have gst/i })).getByRole("radio", { name: /^yes$/i }));

    const gstin = await screen.findByLabelText(/^gstin/i);
    fireEvent.change(gstin, { target: { value: "27aapfu0939f1zw" } });
    expect(await screen.findByText(/this gstin isn't valid/i)).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();

    fireEvent.change(gstin, { target: { value: "27AAPFU0939F1ZV" } });
    await waitFor(() => expect(screen.queryByText(/this gstin isn't valid/i)).not.toBeInTheDocument());
    expect(continueButton()).toBeEnabled();
  });

  it("fixes the proof to the GST certificate with GST, and offers the others without", async () => {
    serve(savedBusiness());
    render(<EmployerBusinessStep />, { wrapper });

    await screen.findByLabelText(/legal name of the business/i);
    const group = screen.getByRole("radiogroup", { name: /do you have gst/i });

    fireEvent.click(within(group).getByRole("radio", { name: /^yes$/i }));
    expect(screen.queryByLabelText(/business proof you will upload/i)).not.toBeInTheDocument();
    expect(screen.getByText("GST certificate")).toBeInTheDocument();

    fireEvent.click(within(group).getByRole("radio", { name: /^no$/i }));
    const proof = await screen.findByLabelText(/business proof you will upload/i);
    expect(within(proof).queryByRole("option", { name: "GST certificate" })).not.toBeInTheDocument();
    expect(within(proof).getByRole("option", { name: "Udyam registration" })).toBeInTheDocument();
  });

  it("saves the business with the GST answer and moves on to who is posting", async () => {
    serve(savedBusiness());
    client.PATCH.mockResolvedValue(ok(savedBusiness()));
    render(<EmployerBusinessStep />, { wrapper });

    fireEvent.change(await screen.findByLabelText(/business name shown on jobs/i), {
      target: { value: "Sai Mobiles" },
    });
    fireEvent.click(continueButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/apply/employer/contact"));
    expect(client.PATCH).toHaveBeenCalledWith(
      "/api/v1/partner/application/employer/",
      expect.objectContaining({
        body: expect.objectContaining({
          expected_version: 3,
          business: expect.objectContaining({
            trade_name: "Sai Mobiles",
            legal_name: "Sri Sai Mobiles Pvt Ltd",
            gst_registered: false,
            gstin: "",
            business_proof_type: "SHOP_ESTABLISHMENT",
            latitude: "17.469000",
            longitude: "78.358000",
          }),
        }),
      }),
    );
  });

  it("refuses a logo that is the wrong type or too big before sending it", async () => {
    serve(savedBusiness());
    render(<EmployerBusinessStep />, { wrapper });

    const file = await screen.findByLabelText(/^logo/i, { selector: "input" });
    fireEvent.change(file, {
      target: { files: [new File(["x"], "logo.gif", { type: "image/gif" })] },
    });
    expect(await screen.findByText(/jpeg, png or webp image/i)).toBeInTheDocument();

    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "logo.png", { type: "image/png" });
    fireEvent.change(file, { target: { files: [big] } });
    expect(await screen.findByText(/2 mb or smaller/i)).toBeInTheDocument();
    expect(client.POST).not.toHaveBeenCalled();
  });

  it("uploads a good logo straight away, without losing what was typed", async () => {
    serve(savedBusiness());
    client.POST.mockResolvedValue(ok(savedBusiness({ logo_url: "http://localhost/logo.png" })));
    render(<EmployerBusinessStep />, { wrapper });

    const legal = await screen.findByLabelText(/legal name of the business/i);
    fireEvent.change(legal, { target: { value: "Sri Sai Mobiles Private Limited" } });
    fireEvent.change(screen.getByLabelText(/^logo/i, { selector: "input" }), {
      target: { files: [new File(["x"], "logo.png", { type: "image/png" })] },
    });

    await waitFor(() => expect(client.POST).toHaveBeenCalledTimes(1));
    expect(client.POST.mock.calls[0]?.[0]).toBe("/api/v1/partner/application/employer/logo/");
    expect(await screen.findByRole("img", { name: /your logo/i })).toHaveAttribute(
      "src",
      "http://localhost/logo.png",
    );
    expect(legal).toHaveValue("Sri Sai Mobiles Private Limited");
  });

  it("sends an individual to their own screen", async () => {
    serve(application(employer({ hiring_as: "INDIVIDUAL" })));
    render(<EmployerBusinessStep />, { wrapper });

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/apply/employer/about"));
  });
});

describe("You and your role", () => {
  beforeEach(() => {
    pathname = "/apply/employer/contact";
  });

  it("needs a role and an ID before it will continue", async () => {
    serve(application(employer({ hiring_as: "BUSINESS", missing_fields: ["poster_role"] })));
    render(<EmployerContactStep />, { wrapper });

    await screen.findByLabelText(/your role/i);
    expect(continueButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/your role/i), { target: { value: "OWNER" } });
    fireEvent.change(screen.getByLabelText(/id you will upload/i), { target: { value: "PAN" } });
    await waitFor(() => expect(continueButton()).toBeEnabled());
  });

  it("tells someone who is not the owner that a letter from the owner is needed", async () => {
    serve(application(employer({ hiring_as: "BUSINESS", missing_fields: [] })));
    render(<EmployerContactStep />, { wrapper });

    const role = await screen.findByLabelText(/your role/i);
    expect(screen.queryByText(/a letter from the owner/i)).not.toBeInTheDocument();

    fireEvent.change(role, { target: { value: "OWNER" } });
    expect(screen.queryByText(/a letter from the owner/i)).not.toBeInTheDocument();

    fireEvent.change(role, { target: { value: "HR" } });
    expect(await screen.findByText(/a letter from the owner/i)).toBeInTheDocument();
  });

  it("saves the role and ID and moves on to the documents", async () => {
    serve(
      application(
        employer({ hiring_as: "BUSINESS", poster_role: "HR", id_document_type: "PAN", missing_fields: [] }),
        { display_name: "Asha Rao" },
      ),
    );
    client.PATCH.mockResolvedValue(ok(application(employer({ hiring_as: "BUSINESS" }), { version: 4 })));
    render(<EmployerContactStep />, { wrapper });

    fireEvent.change(await screen.findByLabelText(/your role/i), { target: { value: "MANAGER" } });
    fireEvent.click(continueButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/apply/documents"));
    expect(client.PATCH).toHaveBeenCalledWith(
      "/api/v1/partner/application/employer/",
      expect.objectContaining({
        body: expect.objectContaining({
          display_name: "Asha Rao",
          poster_role: "MANAGER",
          id_document_type: "PAN",
        }),
      }),
    );
  });

  it("sends an individual to their own screen", async () => {
    serve(application(employer({ hiring_as: "INDIVIDUAL" })));
    render(<EmployerContactStep />, { wrapper });

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/apply/employer/about"));
  });
});
