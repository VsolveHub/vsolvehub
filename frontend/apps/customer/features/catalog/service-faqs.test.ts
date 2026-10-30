import { describe, expect, it } from "vitest";

import type { ServiceDetail } from "./queries";
import { buildServiceFaqs } from "./service-faqs";

type Policy = ServiceDetail["policies"][number];

function detail(overrides: Partial<ServiceDetail> = {}): ServiceDetail {
  return {
    id: "svc-1",
    slug: "ac-deep-cleaning",
    name: "AC Deep Cleaning",
    icon_key: "air-conditioning",
    short_description: "",
    description: "",
    category_slug: "ac-services",
    subcategory_slug: "service-cleaning",
    starting_price: null,
    bookable_variant_id: null,
    request_archetypes: [],
    cover: null,
    variants: [],
    requirement_variants: [],
    policies: [],
    media: [],
    ...overrides,
  } as ServiceDetail;
}

function variant(name: string, paise: number, minutes: number[] = []) {
  return {
    id: `var-${name}`,
    code: name,
    name,
    description: "",
    image_url: "",
    fulfilment_archetype: "A1_TASK_VISIT",
    starting_price: { amount_paise: paise, currency: "INR" },
    minimum_service_subtotal: { amount_paise: 0, currency: "INR" },
    task_lines: minutes.map((value, index) => ({
      code: `t${index}`,
      label: `Task ${index}`,
      unit_price: { amount_paise: paise, currency: "INR" },
      marginal_duration_minutes: value,
    })),
    required_skill_code: "ac-technician",
    questions: [],
  } as unknown as ServiceDetail["variants"][number];
}

function policy(kind: Policy["kind"], text: string): Policy {
  return { id: `${kind}-${text}`, kind, title: "", text, display_order: 1 } as Policy;
}

const questions = (service: ServiceDetail) => buildServiceFaqs(service).map((faq) => faq.question);

describe("buildServiceFaqs", () => {
  const fixedPrice = detail({
    starting_price: { amount_paise: 99_900, currency: "INR" },
    bookable_variant_id: "var-1-ton",
    variants: [variant("Up to 1 ton", 99_900), variant("2 ton and above", 139_900, [110])],
    policies: [
      policy("EXCLUDED", "Spare parts, quoted separately"),
      policy("INCLUDED", "30-day warranty on the workmanship"),
      policy("GOOD_TO_KNOW", "Extra time or parts are charged only after your approval."),
    ],
  });

  it("answers price from the published starting price and good-to-know lines", () => {
    const price = buildServiceFaqs(fixedPrice)[0];
    expect(price?.question).toBe("How much does AC Deep Cleaning cost?");
    expect(price?.answer).toMatch(/₹999/);
    expect(price?.answer).toMatch(/2 options/);
    expect(price?.answer).toMatch(/only after your approval/);
  });

  it("uses the one published duration and names its option", () => {
    const duration = buildServiceFaqs(fixedPrice).find((faq) => faq.question.startsWith("How long"));
    expect(duration?.answer).toBe(
      "About 1 hr 50 min for 2 ton and above. Time can vary with the condition of the job on the day.",
    );
  });

  it("lists exclusions and warranty only from policies", () => {
    const faqs = buildServiceFaqs(fixedPrice);
    expect(faqs.find((faq) => faq.question === "What is not covered?")?.answer).toBe(
      "Spare parts, quoted separately.",
    );
    expect(faqs.find((faq) => faq.question.includes("warranty"))?.answer).toBe(
      "Yes. 30-day warranty on the workmanship.",
    );
  });

  it("offers booking questions only for a fixed-price service", () => {
    expect(questions(fixedPrice)).toEqual(
      expect.arrayContaining(["When is my booking confirmed?", "Can I cancel?"]),
    );
    // Several priced options leave `bookable_variant_id` null; they are still booked directly.
    expect(questions({ ...fixedPrice, bookable_variant_id: null })).toContain("Can I cancel?");
    const quoteOnly = detail({ request_archetypes: ["A5_CUSTOM_PROJECT"] });
    expect(questions(quoteOnly)).toEqual(["How is AC Deep Cleaning priced?", "Who will do the job?"]);
  });

  it("leads a crew service with booking a crew, not quotes alone", () => {
    const crew = buildServiceFaqs(detail({ request_archetypes: ["A3_TIME_BLOCK"] }))[0];
    expect(crew?.answer).toMatch(/^You can book a crew directly/);
  });

  it("asks nothing it cannot answer from data", () => {
    // No price, duration, exclusions or warranty published: only the platform fact remains.
    expect(questions(detail())).toEqual(["Who will do the job?"]);
  });
});
