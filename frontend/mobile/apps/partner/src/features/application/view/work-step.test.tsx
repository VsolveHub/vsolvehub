import { fireEvent, render } from "@testing-library/react-native";
import { I18nProvider } from "@vsolve/mobile-ui";

import { catalogs } from "../../../i18n/catalogs";
import { WorkStep } from "./work-step";

const mockUpdate = jest.fn();
let mockDraft = {
  displayName: "",
  biography: "",
  experienceYears: 0,
  skillCodes: ["carpenter"] as string[],
  serviceVariantIds: [] as string[],
  serviceAreaIds: [] as string[],
  consents: [],
};

jest.mock("./application-editor", () => ({
  useApplicationEditor: () => ({ draft: mockDraft, update: mockUpdate, isReadOnly: false }),
  useProceedDisabled: jest.fn(),
}));
jest.mock("../reference-queries", () => ({
  useApplicationReference: () => ({
    isPending: false,
    isError: false,
    refetch: jest.fn(),
    skills: [
      { code: "carpenter", name: "Carpenter" },
      { code: "gas-technician", name: "Gas technician" },
    ],
  }),
}));

const categories = [{ id: "c1", slug: "technician", name: "Technician", iconKey: "", imageUrl: "" }];
const row = (serviceId: string, serviceName: string, variantId: string, variantName: string, skill = "") => ({
  serviceId,
  serviceName,
  variantId,
  variantCode: variantId,
  variantName,
  categoryName: "Technician",
  requiredSkillCode: skill,
});
const services = [
  row("stove", "Gas Stove Repair", "v-2", "2 burner", "gas-technician"),
  row("stove", "Gas Stove Repair", "v-3", "3 burner", "gas-technician"),
  row("stove", "Gas Stove Repair", "v-4", "4 burner and above", "gas-technician"),
  row("door", "Door Repair", "v-door", "Standard service"),
];

async function show() {
  return render(
    <I18nProvider locale="en-IN" catalog={catalogs["en-IN"]}>
      <WorkStep mainCategories={categories} services={services} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDraft = { ...mockDraft, skillCodes: ["carpenter"], serviceVariantIds: [] };
});

describe("Your work", () => {
  it("lists the services, not every variant under them", async () => {
    const { getByText, queryByText } = await show();
    expect(getByText("Gas Stove Repair")).toBeTruthy();
    expect(getByText("Door Repair")).toBeTruthy();
    expect(queryByText("2 burner")).toBeNull();
    expect(queryByText("3 burner")).toBeNull();
    expect(queryByText("4 burner and above")).toBeNull();
    // "Standard service" was the whole label of hundreds of rows; it must not stand in for a name.
    expect(queryByText("Standard service")).toBeNull();
  });

  it("ticking a service saves all its variants and the trade they need", async () => {
    const { getByText } = await show();
    await fireEvent.press(getByText("Gas Stove Repair"));
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const patch = mockUpdate.mock.calls[0][0] as { serviceVariantIds: string[]; skillCodes: string[] };
    expect([...patch.serviceVariantIds].sort()).toEqual(["v-2", "v-3", "v-4"]);
    expect([...patch.skillCodes].sort()).toEqual(["carpenter", "gas-technician"]);
  });

  it("unticking a service drops all its variants and the trade only they needed", async () => {
    mockDraft = { ...mockDraft, skillCodes: ["carpenter", "gas-technician"], serviceVariantIds: ["v-2", "v-3", "v-4"] };
    const { getByText } = await show();
    await fireEvent.press(getByText("Gas Stove Repair"));
    const patch = mockUpdate.mock.calls[0][0] as { serviceVariantIds: string[]; skillCodes: string[] };
    expect(patch.serviceVariantIds).toEqual([]);
    expect(patch.skillCodes).toEqual(["carpenter"]);
  });
});
