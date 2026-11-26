// Ported from frontend/apps/partner/features/catalog/queries.test.ts
import { getWorkCatalog } from "./queries";

const mockGet = jest.fn();
jest.mock("@vsolve/mobile-core", () => ({ getApiClient: () => ({ GET: mockGet }) }));

const payload = [
  {
    id: "c-tech",
    slug: "technician",
    name: "Technician",
    icon_key: "wrench",
    image_url: "",
    services: [
      {
        id: "s-stove",
        slug: "gas-stove-repair",
        name: "Gas Stove Repair",
        variants: [
          { id: "v-2", code: "2-burner", name: "2 burner", required_skill_code: "gas-stove-technician" },
          { id: "v-3", code: "3-burner", name: "3 burner", required_skill_code: "gas-stove-technician" },
        ],
      },
      {
        id: "s-door",
        slug: "door-repair",
        name: "Door Repair",
        variants: [{ id: "v-door", code: "standard", name: "Standard service", required_skill_code: "" }],
      },
    ],
  },
  { id: "c-events", slug: "events", name: "Events", icon_key: "", image_url: "", services: [] },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: payload, response: new Response(null, { status: 200 }) });
});

describe("the work catalogue", () => {
  it("is one request, however many categories and services there are", async () => {
    // Regression: the phone made one request per category and one per service (about 676).
    await getWorkCatalog();
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/v1/partner/work-catalog/");
  });

  it("gives every trade, even one with nothing open, and a row per variant with its service", async () => {
    const catalog = await getWorkCatalog();
    expect(catalog.mainCategories.map((category) => category.slug)).toEqual(["technician", "events"]);
    expect(catalog.services.map((service) => [service.serviceName, service.variantName])).toEqual([
      ["Gas Stove Repair", "2 burner"],
      ["Gas Stove Repair", "3 burner"],
      ["Door Repair", "Standard service"],
    ]);
    expect(catalog.services[0]).toMatchObject({
      serviceId: "s-stove",
      categoryName: "Technician",
      requiredSkillCode: "gas-stove-technician",
    });
  });
});
