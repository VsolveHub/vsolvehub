import { render } from "@testing-library/react-native";

import { useWorkCatalog } from "@/features/catalog/queries";

import { usePartnerApplication, usePartnerAvailability } from "../queries";
import { useApplicationReference } from "../reference-queries";
import { ProfilePreview } from "./profile-preview";

jest.mock("../queries", () => ({
  usePartnerApplication: jest.fn(),
  usePartnerAvailability: jest.fn(),
}));
jest.mock("../reference-queries", () => ({ useApplicationReference: jest.fn() }));
jest.mock("@/features/catalog/queries", () => ({ useWorkCatalog: jest.fn() }));
jest.mock("@vsolve/mobile-core", () => ({ getApiClient: jest.fn() }));
jest.mock("@vsolve/query/native", () => ({
  ...jest.requireActual("@vsolve/query/native"),
  useCurrentSession: () => ({ data: { user: { phone_number: "+919900000099" } } }),
}));

const application = {
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
};

const reference = {
  serviceAreas: [{ id: "a1", name: "Alappuzha" }],
  skills: [{ id: "s1", code: "ELECTRICAL", name: "Electrical", description: "" }],
  requiredConsents: [{ purpose: "PARTNER_TERMS", title: "Partner terms", document_version: "1" }],
  isPending: false,
  isError: false,
  refetch: jest.fn(),
};

function mockQueries(app: object) {
  jest.mocked(usePartnerApplication).mockReturnValue(app as never);
  jest.mocked(useApplicationReference).mockReturnValue(reference as never);
  jest.mocked(usePartnerAvailability).mockReturnValue({
    isPending: false,
    isError: false,
    data: {
      rules: [
        { id: "r1", service_area_id: "a1", weekday: 0, starts_at: "09:00:00", ends_at: "18:00:00", ends_next_day: false, is_active: true },
      ],
      exceptions: [],
    },
  } as never);
  jest.mocked(useWorkCatalog).mockReturnValue({
    isPending: false,
    isError: false,
    data: { mainCategories: [], services: [{ variantId: "v1", serviceName: "Fan repair", variantName: "Ceiling fan" }] },
  } as never);
}

describe("ProfilePreview", () => {
  it("shows the loading state", async () => {
    mockQueries({ isPending: true, isError: false, data: undefined, error: null });
    const view = await render(<ProfilePreview />);
    expect(view.getByText("Loading your profile…")).toBeTruthy();
  });

  it("shows the error state", async () => {
    mockQueries({ isPending: false, isError: true, data: undefined, error: new Error("offline"), refetch: jest.fn() });
    const view = await render(<ProfilePreview />);
    expect(view.getByText("We could not load your profile")).toBeTruthy();
  });

  it("shows every step of a services application with edit links", async () => {
    mockQueries({ isPending: false, isError: false, data: application, error: null });
    const view = await render(<ProfilePreview />);

    for (const title of ["About you", "Your work", "Where you work", "Your hours", "Documents", "Agree & send"]) {
      expect(view.getByLabelText(`Edit ${title}`)).toBeTruthy();
    }
    expect(view.getByText("Draft")).toBeTruthy();
    expect(view.getAllByText("Ravi Kumar").length).toBeGreaterThan(0);
    expect(view.getByText("+919900000099 · Home services")).toBeTruthy();
    expect(view.getByText("Electrical")).toBeTruthy();
    expect(view.getByText("Fan repair · Ceiling fan")).toBeTruthy();
    expect(view.getByText("Not uploaded")).toBeTruthy();
    expect(view.getAllByText("Alappuzha").length).toBeGreaterThan(0);
    expect(view.getByText("Monday")).toBeTruthy();
    expect(view.getByText("09:00 – 18:00")).toBeTruthy();
    expect(view.getByText("Partner terms")).toBeTruthy();
    expect(view.getAllByText("Edit")).toHaveLength(6);
  });

  it("hides edit links once the application is sent", async () => {
    mockQueries({ isPending: false, isError: false, data: { ...application, status: "SUBMITTED", can_edit: false }, error: null });
    const view = await render(<ProfilePreview />);
    expect(view.getByText("Sent")).toBeTruthy();
    expect(view.queryByText("Edit")).toBeNull();
  });
});
