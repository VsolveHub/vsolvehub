import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const get = vi.fn();
vi.mock("@/lib/api/public", () => ({ createPublicApi: () => ({ GET: get }) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  // `cache` memoises per request on the server; each test needs a fresh call.
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const { getWorkCatalog } = await import("./queries");

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
    ],
  },
  { id: "c-events", slug: "events", name: "Events", icon_key: "", image_url: "", services: [] },
];

describe("the work catalogue", () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({ data: payload, response: new Response(null, { status: 200 }) });
  });

  it("is one request, however many categories and services there are", async () => {
    await getWorkCatalog();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/api/v1/partner/work-catalog/");
  });

  it("gives every trade, even one with nothing open, and a row per variant with its service", async () => {
    const catalog = await getWorkCatalog();
    expect(catalog.mainCategories.map((category) => category.slug)).toEqual(["technician", "events"]);
    expect(catalog.services.map((service) => [service.serviceName, service.variantName])).toEqual([
      ["Gas Stove Repair", "2 burner"],
      ["Gas Stove Repair", "3 burner"],
    ]);
  });
});
