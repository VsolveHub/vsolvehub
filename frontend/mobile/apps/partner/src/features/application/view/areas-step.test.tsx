import { fireEvent, render } from "@testing-library/react-native";
import { I18nProvider } from "@vsolve/mobile-ui";

import { catalogs } from "../../../i18n/catalogs";
import { AreasStep } from "./areas-step";

const mockUpdate = jest.fn();
const mockBlocked = jest.fn();
let mockDraft = {
  displayName: "",
  biography: "",
  experienceYears: 0,
  skillCodes: [] as string[],
  serviceVariantIds: [] as string[],
  serviceAreaIds: [] as string[],
  requestedPostalCodes: [] as string[],
  consents: [],
};
let mockAreas = [
  { id: "a1", name: "Mahbubnagar", postal_codes: ["509001"] },
  { id: "a2", name: "Shadnagar", postal_codes: ["509001", "509216"] },
  { id: "a3", name: "Gachibowli", postal_codes: ["500032"] },
];
let mockApplication: unknown = null;

jest.mock("./application-editor", () => ({
  useApplicationEditor: () => ({
    draft: mockDraft,
    update: mockUpdate,
    application: mockApplication,
    isReadOnly: false,
  }),
  useProceedDisabled: (blocked: boolean) => mockBlocked(blocked),
}));
jest.mock("../reference-queries", () => ({
  useApplicationReference: () => ({
    isPending: false,
    isError: false,
    refetch: jest.fn(),
    serviceAreas: mockAreas,
    skills: [],
  }),
}));

async function show() {
  return render(
    <I18nProvider locale="en-IN" catalog={catalogs["en-IN"]}>
      <AreasStep />
    </I18nProvider>,
  );
}

async function typePin(screen: Awaited<ReturnType<typeof show>>, pin: string) {
  await fireEvent.press(screen.getByText("+ My area is not listed"));
  await fireEvent.changeText(screen.getByPlaceholderText(/509216/), pin);
  await fireEvent.press(screen.getByText("Add"));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApplication = null;
  mockAreas = [
    { id: "a1", name: "Mahbubnagar", postal_codes: ["509001"] },
    { id: "a2", name: "Shadnagar", postal_codes: ["509001", "509216"] },
    { id: "a3", name: "Gachibowli", postal_codes: ["500032"] },
  ];
  mockDraft = { ...mockDraft, serviceAreaIds: [], requestedPostalCodes: [] };
});

describe("Where you work (FLOW.md Step 3)", () => {
  it("always offers 'My area is not listed' next to the list (no dead end)", async () => {
    const { getByText } = await show();
    expect(getByText("Mahbubnagar")).toBeTruthy();
    expect(getByText("+ My area is not listed")).toBeTruthy();
  });

  it("blocks Continue with nothing ticked and no PIN asked", async () => {
    await show();
    expect(mockBlocked).toHaveBeenLastCalledWith(true);
  });

  it("lets Continue through with only an asked PIN", async () => {
    mockDraft = { ...mockDraft, requestedPostalCodes: ["509216"] };
    await show();
    expect(mockBlocked).toHaveBeenLastCalledWith(false);
  });

  it("case B: a PIN in two open areas ticks both of them", async () => {
    const screen = await show();
    await typePin(screen, "509001");
    expect(mockUpdate).toHaveBeenCalledWith({ serviceAreaIds: ["a1", "a2"] });
    expect(screen.getByText(/509001 is in Mahbubnagar, Shadnagar/)).toBeTruthy();
  });

  it("case D: a PIN no open area covers is noted as a request, not ticked", async () => {
    const screen = await show();
    await typePin(screen, "600001");
    expect(mockUpdate).toHaveBeenCalledWith({ requestedPostalCodes: ["600001"] });
  });

  it("case E: a bad PIN is refused and nothing is saved", async () => {
    const screen = await show();
    await typePin(screen, "012345");
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid 6-digit Indian PIN code.")).toBeTruthy();
  });

  it("allows at most 5 asked PINs and no repeats", async () => {
    mockDraft = { ...mockDraft, requestedPostalCodes: ["600001", "600002", "600003", "600004", "600005"] };
    const screen = await show();
    await typePin(screen, "600006");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("case F: with no open areas the PIN box takes the list's place", async () => {
    mockAreas = [];
    const screen = await show();
    expect(screen.queryByText("+ My area is not listed")).toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText(/509216/), "600001");
    await fireEvent.press(screen.getByText("Add"));
    expect(mockUpdate).toHaveBeenCalledWith({ requestedPostalCodes: ["600001"] });
  });

  it("case H: an asked PIN that now has an open area can be ticked in one tap", async () => {
    mockDraft = { ...mockDraft, requestedPostalCodes: ["509216"] };
    mockApplication = {
      area_requests: [
        { postal_code: "509216", status: "READY", covering_area_id: "a2", covering_area_name: "Shadnagar" },
      ],
    };
    const screen = await show();
    await fireEvent.press(screen.getByText("Tick it"));
    expect(mockUpdate).toHaveBeenCalledWith({ serviceAreaIds: ["a2"], requestedPostalCodes: [] });
  });
});
