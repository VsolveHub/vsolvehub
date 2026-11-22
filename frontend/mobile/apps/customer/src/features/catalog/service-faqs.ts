import { formatMoney } from "@vsolve/mobile-ui";

import type { ServiceDetail } from "./client-queries";
import { durationLabel, policyTexts, variantDuration, formatDuration } from "./service-facts";

export interface ServiceFaq {
  question: string;
  answer: string;
}

export function buildServiceFaqs(service: ServiceDetail): ServiceFaq[] {
  const faqs: ServiceFaq[] = [];
  const name = service.name;
  const isFixedPrice = service.variants.length > 0;
  const goodToKnow = policyTexts(service.policies, "GOOD_TO_KNOW");

  if (service.starting_price !== null) {
    const options =
      service.variants.length > 1
        ? ` There are ${service.variants.length} options, each with its own starting price, so pick the one that matches your job.`
        : "";
    faqs.push({
      question: `How much does ${name} cost?`,
      answer:
        `Prices start at ${formatMoney(service.starting_price.amount_paise)}.${options}` +
        " The exact amount is calculated from what you select and shown to you before you pay." +
        (goodToKnow.length > 0 ? ` ${goodToKnow.join(" ")}` : ""),
    });
  } else if (service.request_archetypes.includes("A3_TIME_BLOCK")) {
    faqs.push({
      question: `How is ${name} priced?`,
      answer:
        "You can book a crew directly, or describe the job and get quotes from verified professionals instead. Either way, the amount for your booking is shown to you before you pay.",
    });
  } else if (service.request_archetypes.length > 0) {
    faqs.push({
      question: `How is ${name} priced?`,
      answer:
        "This work is priced per job. Describe what you need and verified professionals send you their own quotes. Describing the job costs nothing, and you only pay once you accept a quote.",
    });
  }

  const durations = service.variants
    .map((variant) => ({ variant, duration: variantDuration(variant) }))
    .filter((entry) => entry.duration !== null);
  if (durations.length === 1 && durations[0]) {
    const label = durationLabel(durations[0].variant);
    if (label) {
      faqs.push({
        question: "How long does the visit take?",
        answer: `${label} for ${durations[0].variant.name.toLowerCase()}. Time can vary with the condition of the job on the day.`,
      });
    }
  } else if (durations.length > 1) {
    const shortest = Math.min(...durations.map((entry) => entry.duration?.minutes ?? Infinity));
    faqs.push({
      question: "How long does the visit take?",
      answer: `It depends on the option you choose, starting from about ${formatDuration(shortest)}. Each option above shows its own estimate.`,
    });
  }

  const excluded = policyTexts(service.policies, "EXCLUDED");
  if (excluded.length > 0) {
    faqs.push({
      question: "What is not covered?",
      answer: `${excluded.join(". ")}.`.replace(/\.\./g, "."),
    });
  }

  faqs.push({
    question: "Who will do the job?",
    answer:
      "A professional approved on V Solve Hub for this kind of work. Professionals submit identity documents, which our team reviews before they can accept jobs.",
  });

  if (isFixedPrice) {
    faqs.push({
      question: "When is my booking confirmed?",
      answer:
        "Once you have paid and a professional has accepted the visit. Until then Your bookings shows where it stands, such as \"Awaiting payment\" or \"Finding a professional\".",
    });
    faqs.push({
      question: "Can I cancel?",
      answer:
        "Yes, from Your bookings. The cancellation terms for your slot, including any fee, are shown before you pay.",
    });
  }

  return faqs;
}

