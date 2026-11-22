import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react-native";
import { I18nProvider } from "@vsolve/mobile-ui";
import { useState, type ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useWorkCatalog } from "@/features/catalog/queries";

import { catalogs } from "../../../i18n/catalogs";
import { usePartnerApplication, usePartnerAvailability } from "../queries";
import { useApplicationReference } from "../reference-queries";
import { DocumentsStep } from "./documents-step";
import { ProfilePreview } from "./profile-preview";
import { ReviewStep } from "./review-step";

/**
 * What an employer sees on the phone after their details: the documents they upload (an ID, and
 * for an individual a selfie; for a business its proof and maybe the owner's letter), the summary
 * on "Agree & send", and the read-only profile.
 */

jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

jest.mock("../queries", () => ({
  ...jest.requireActual<typeof import("../queries")>("../queries"),
  usePartnerApplication: jest.fn(),
  usePartnerAvailability: jest.fn(),
  useSubmitApplication: () => ({ mutate: jest.fn(), isPending: false, error: null, reset: jest.fn() }),
  useUpdateApplication: () => ({ mutate: jest.fn(), isPending: false, error: null, reset: jest.fn() }),
}));
jest.mock("../reference-queries", () => ({ useApplicationReference: jest.fn() }));
jest.mock("../upload-queries", () => ({
  usePartnerDocumentAccess: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUploadDocument: () => ({ mutateAsync: jest.fn(), isPending: false }),
  UploadFailure: class UploadFailure extends Error {},
}));
jest.mock("@/features/catalog/queries", () => ({ useWorkCatalog: jest.fn() }));
jest.mock("@vsolve/mobile-core", () => ({ getApiClient: jest.fn() }));
jest.mock("@vsolve/query/native", () => ({
  ...jest.requireActual("@vsolve/query/native"),
  useCurrentSession: () => ({ data: { user: { phone_number: "+919900000099" } } }),
}));
jest.mock("@/features/onboarding/components/notification-permission-sheet", () => ({
  NotificationPermissionSheet: () => null,
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function Harness({ children }: { children: ReactElement }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }));
  return (
    <I18nProvider locale="en-IN" catalog={catalogs["en-IN"]}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}

const individual = {
  hiring_as: "INDIVIDUAL",
  poster_role: "",
  id_document_type: "AADHAAR_MASKED",
  email: "priya@example.com",
  area: "Kondapur",
  city: "Hyderabad",
  pin_code: "500084",
  business: null,
  missing_fields: [],
};

const business = {
  hiring_as: "BUSINESS",
  poster_role: "MANAGER",
  id_document_type: "PAN",
  email: "",
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
    address: "Shop 12",
    area: "Kondapur",
    city: "Hyderabad",
    state: "Telangana",
    pin_code: "500084",
    website_url: "",
    logo_url: "",
  },
};

function application(employer: object, overrides: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    status: "DRAFT",
    version: 4,
    can_edit: true,
    track: "EMPLOYER",
    display_name: "Priya Sharma",
    biography: "",
    skill_codes: [],
    service_variant_ids: [],
    service_area_ids: [],
    consents: [],
    documents: [],
    consents_complete: false,
    required_document_kinds: ["GOVERNMENT_ID", "SELFIE"],
    offered_document_kinds: ["GOVERNMENT_ID", "SELFIE"],
    employer,
    ...overrides,
  };
}

function givenApplication(app: object) {
  jest.mocked(usePartnerApplication).mockReturnValue({
    data: app,
    error: null,
    isError: false,
    isPending: false,
    dataUpdatedAt: 1,
    errorUpdatedAt: 0,
    refetch: jest.fn(),
  } as never);
  jest.mocked(usePartnerAvailability).mockReturnValue({ isPending: false, isError: false, data: { rules: [], exceptions: [] } } as never);
  jest.mocked(useApplicationReference).mockReturnValue({
    serviceAreas: [],
    skills: [],
    requiredConsents: [],
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  } as never);
  jest.mocked(useWorkCatalog).mockReturnValue({ isPending: false, isError: false, data: [], refetch: jest.fn() } as never);
}

describe("an individual's documents", () => {
  it("asks for their ID, named for what it is, and says which ID they chose", async () => {
    givenApplication(application(individual));
    const view = await render(<Harness><DocumentsStep /></Harness>);

    expect(view.getByText("Your ID")).toBeTruthy();
    expect(view.getByText("ID type: Masked Aadhaar")).toBeTruthy();
    expect(view.getByText(/masked Aadhaar: only the last 4 digits/i)).toBeTruthy();
    expect(view.getByText("So candidates know a real person is hiring.")).toBeTruthy();
  });

  it("asks for a selfie, and offers only the camera and the photo library for it", async () => {
    givenApplication(application(individual));
    const view = await render(<Harness><DocumentsStep /></Harness>);

    expect(view.getByText("Selfie")).toBeTruthy();
    expect(view.getByText("We match it with your ID photo. Face the camera in good light.")).toBeTruthy();
    expect(view.getAllByText("JPG or PNG photo · max 20 MB")).toHaveLength(1);

    // The ID's chooser offers a PDF too; the selfie's does not.
    const choosers = view.getAllByLabelText("Choose a file");
    await fireEvent.press(choosers[1]!);
    expect(view.getByText("Take photo with camera")).toBeTruthy();
    expect(view.queryByText("Choose document (PDF / Image)")).toBeNull();
  });
});

describe("a business's documents", () => {
  const withLetter = application(business, {
    required_document_kinds: ["GOVERNMENT_ID", "BUSINESS_PROOF", "AUTHORIZATION_LETTER"],
    offered_document_kinds: ["GOVERNMENT_ID", "BUSINESS_PROOF", "AUTHORIZATION_LETTER"],
  });

  it("names the business proof by the one they said they would upload, and asks for the owner's letter", async () => {
    givenApplication(withLetter);
    const view = await render(<Harness><DocumentsStep /></Harness>);

    expect(view.getByText("Business proof: Udyam registration")).toBeTruthy();
    expect(view.getByText("Authorization letter")).toBeTruthy();
    expect(view.getByText(/On business letterhead, signed by the owner/)).toBeTruthy();
    expect(view.queryByText("Selfie")).toBeNull();
  });
});

describe("the summary on Agree & send", () => {
  it("shows an individual who is hiring and where they are, with a way back to edit", async () => {
    givenApplication(application(individual));
    const view = await render(<Harness><ReviewStep /></Harness>);

    expect(view.getByText("Who is hiring")).toBeTruthy();
    expect(view.getByText("For myself or my home")).toBeTruthy();
    expect(view.getByText("Priya Sharma · Kondapur, Hyderabad")).toBeTruthy();
    expect(view.queryByText("About you")).toBeNull();
  });

  it("shows a business by its public name, kind, place and GST answer, and who is posting", async () => {
    givenApplication(application(business, { required_document_kinds: ["GOVERNMENT_ID", "BUSINESS_PROOF"] }));
    const view = await render(<Harness><ReviewStep /></Harness>);

    expect(view.getByText("For my business")).toBeTruthy();
    expect(view.getByText("Sai Mobiles")).toBeTruthy();
    expect(view.getByText("Shop · 11-50")).toBeTruthy();
    expect(view.getByText("Kondapur, Hyderabad")).toBeTruthy();
    expect(view.getByText("No GST")).toBeTruthy();
    expect(view.getByText("Priya Sharma · Manager")).toBeTruthy();
  });
});

describe("the read-only profile", () => {
  it("shows a business's answers from the application, not a separate profile", async () => {
    givenApplication(application(business, { required_document_kinds: ["GOVERNMENT_ID", "BUSINESS_PROOF"] }));
    const view = await render(<Harness><ProfilePreview /></Harness>);

    expect(view.getByText("Sri Sai Mobiles Pvt Ltd")).toBeTruthy();
    expect(view.getByText("Udyam registration")).toBeTruthy();
    expect(view.getByText("Shop 12, Kondapur, Hyderabad, Telangana, 500084")).toBeTruthy();
  });

  it("shows an individual's name and place", async () => {
    givenApplication(application(individual));
    const view = await render(<Harness><ProfilePreview /></Harness>);

    expect(view.getByText("Kondapur")).toBeTruthy();
    expect(view.getByText("Masked Aadhaar")).toBeTruthy();
  });
});
