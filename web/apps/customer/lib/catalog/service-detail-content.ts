export type ServiceDetailInput = {
  id: string;
  name: string;
  slug: string;
  description: string;
  pricePaise: number;
  duration: number;
  archetype: string;
  unit: string;
  category: { name: string; slug: string; icon: string };
  subCategory?: { name: string; slug: string } | null;
};

export type ServiceDetailContent = {
  rating: number;
  reviewCountLabel: string;
  originalPricePaise: number | null;
  unitPriceLabel: string | null;
  professionalTitle: string;
  covered: string[];
  notCovered: string[];
  process: string[];
  trustSignals: { icon: string; text: string }[];
  equipment: { name: string; icon: string }[];
  requirements: { name: string; icon: string }[];
  damageProtection: string;
  faqs: { question: string; answer: string }[];
  reviews: {
    name: string;
    date: string;
    rating: number;
    text: string;
    serviceLabel: string;
  }[];
  ratingDistribution: { stars: number; percent: number; label: string }[];
};

type DetailTemplate = Omit<
  ServiceDetailContent,
  "rating" | "reviewCountLabel" | "originalPricePaise" | "unitPriceLabel" | "reviews" | "ratingDistribution"
>;

function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h;
}

function pick<T>(arr: T[], slug: string, offset = 0): T {
  return arr[(hashSlug(slug) + offset) % arr.length];
}

function label(name: string, service: string): string {
  return name.replace(/\{service\}/g, service);
}

const REVIEWERS = ["Reshma", "Umasankar", "Priya", "Arjun", "Kavitha", "Rahul", "Deepa", "Suresh"];
const REVIEW_SNIPPETS = [
  "Professional arrived on time and did excellent work. Very satisfied with the service quality.",
  "Great experience overall. The team was polite, skilled, and left everything clean.",
  "Booked through V Solve Hub — smooth process and fair pricing. Would recommend.",
  "Did exactly what was promised. Good communication before and during the visit.",
];

const CATEGORY_TEMPLATES: Record<string, DetailTemplate> = {
  "home-services": {
    professionalTitle: "Top professionals",
    covered: [
      "Diagnosis and repair for common {service} issues",
      "Basic materials and standard spare parts included",
      "Post-service cleanup of work area",
      "Safety checks before and after the job",
      "30-minute support window after completion",
    ],
    notCovered: [
      "Major replacements without prior approval",
      "Structural changes or civil work",
      "Premium branded parts (charged separately)",
      "Issues outside the booked scope",
    ],
    process: [
      "Professional assigned based on your location and slot",
      "Call or chat before arrival to confirm requirements",
      "On-site inspection and quote for any add-ons",
      "Service delivery with quality checklist",
      "Digital job summary shared after completion",
    ],
    trustSignals: [
      { icon: "🎓", text: "Trained for 100+ hours" },
      { icon: "⭐", text: "Average 4.8+ ratings" },
      { icon: "🏠", text: "Served 100K+ homes" },
      { icon: "🛡️", text: "Verified by V Solve Hub" },
    ],
    equipment: [
      { name: "Tool kit", icon: "🧰" },
      { name: "Safety gear", icon: "🦺" },
      { name: "Testing devices", icon: "📟" },
      { name: "Cleaning supplies", icon: "🧴" },
      { name: "Spare parts", icon: "🔩" },
      { name: "Ladders", icon: "🪜" },
    ],
    requirements: [
      { name: "Clear access", icon: "🚪" },
      { name: "Power point", icon: "🔌" },
      { name: "Water supply", icon: "🚰" },
    ],
    damageProtection: "Up to ₹5,000 cover if any damage happens during the job",
    faqs: [
      {
        question: "Do I need to provide any materials?",
        answer:
          "Standard consumables are carried by the professional. Premium parts will be quoted on-site before work begins.",
      },
      {
        question: "What if there is no electricity or water during the visit?",
        answer:
          "Please reschedule or ensure utilities are available. Some diagnostics cannot be completed without access.",
      },
      {
        question: "Is there a warranty on the work?",
        answer: "Yes — a 7-day service warranty applies on workmanship for most home service bookings.",
      },
    ],
  },
  "construction-services": {
    professionalTitle: "Skilled crew",
    covered: [
      "On-site labour for {service} as per scope discussed",
      "Standard hand tools and basic equipment",
      "Daily progress update to site supervisor",
      "Safe disposal of minor job-site waste",
      "Coordination with other trades on request",
    ],
    notCovered: [
      "Material procurement unless pre-agreed",
      "Heavy machinery rental",
      "Structural engineering or approvals",
      "Work in unsafe or unapproved conditions",
    ],
    process: [
      "Site visit or call to understand scope and headcount",
      "Crew assigned with skill-matched workers",
      "Daily attendance and work logs maintained",
      "Quality check at end of each day",
      "Final handover and sign-off",
    ],
    trustSignals: [
      { icon: "👷", text: "Skilled daily-wage crew" },
      { icon: "⭐", text: "4.7+ crew ratings" },
      { icon: "🏗️", text: "500+ sites served" },
      { icon: "🛡️", text: "Background-verified workers" },
    ],
    equipment: [
      { name: "Hand tools", icon: "🔨" },
      { name: "Measuring tools", icon: "📏" },
      { name: "Safety helmets", icon: "⛑️" },
      { name: "Mixing tools", icon: "🪣" },
      { name: "Cutting tools", icon: "⚙️" },
      { name: "Scaffolding aids", icon: "🪜" },
    ],
    requirements: [
      { name: "Site access", icon: "🚧" },
      { name: "Material storage", icon: "📦" },
      { name: "Supervisor contact", icon: "📱" },
    ],
    damageProtection: "Up to ₹10,000 cover for accidental on-site damage by assigned crew",
    faqs: [
      {
        question: "How is crew size decided?",
        answer:
          "You specify headcount and days at booking. The dispatch team can suggest optimal crew size based on your scope.",
      },
      {
        question: "Are materials included?",
        answer: "Labour-only by default. Materials can be arranged separately or supplied by you on site.",
      },
    ],
  },
  "beauty-wellness": {
    professionalTitle: "Top stylists",
    covered: [
      "At-home {service} by trained beautician",
      "Hygienic single-use kits where applicable",
      "Consultation before treatment",
      "Post-care tips shared after session",
      "Touch-up guidance within 24 hours (select services)",
    ],
    notCovered: [
      "Medical skin treatments",
      "Allergic reaction treatment",
      "Salon infrastructure setup",
      "Products retail without booking add-on",
    ],
    process: [
      "Beautician assigned based on service type",
      "Pre-call to confirm allergies and preferences",
      "Setup of portable workstation at your home",
      "Service delivery with hygiene protocol",
      "Cleanup and after-care instructions",
    ],
    trustSignals: [
      { icon: "💅", text: "Certified beauticians" },
      { icon: "⭐", text: "4.85+ ratings" },
      { icon: "✨", text: "50K+ sessions delivered" },
      { icon: "🛡️", text: "Hygiene-verified pros" },
    ],
    equipment: [
      { name: "Styling kit", icon: "💄" },
      { name: "Disposable sheets", icon: "🧻" },
      { name: "Steam tools", icon: "♨️" },
      { name: "Mirrors", icon: "🪞" },
      { name: "Sanitisers", icon: "🧴" },
      { name: "Brushes", icon: "🖌️" },
    ],
    requirements: [
      { name: "Well-lit area", icon: "💡" },
      { name: "Chair & table", icon: "🪑" },
      { name: "Power point", icon: "🔌" },
    ],
    damageProtection: "Up to ₹3,000 cover for accidental damage to fixtures during setup",
    faqs: [
      {
        question: "Do I need to provide products?",
        answer: "Professionals carry standard products. Premium brands can be requested as an add-on.",
      },
      {
        question: "Is the service safe for sensitive skin?",
        answer: "Share allergies during booking. Patch tests can be done for select treatments.",
      },
    ],
  },
  "event-media-services": {
    professionalTitle: "Top event partners",
    covered: [
      "End-to-end {service} as per package",
      "Pre-event coordination call",
      "On-time arrival on event day",
      "Standard deliverables listed in package",
      "One round of reasonable revisions (editing services)",
    ],
    notCovered: [
      "Venue charges and permissions",
      "Travel beyond city limits without add-on",
      "Rush delivery under 48 hours",
      "Third-party vendor failures",
    ],
    process: [
      "Requirement call and package confirmation",
      "Advance and slot blocking",
      "Team briefing before event day",
      "On-site execution with coordinator",
      "Delivery of outputs per timeline",
    ],
    trustSignals: [
      { icon: "📸", text: "Experienced event crews" },
      { icon: "⭐", text: "4.8+ partner ratings" },
      { icon: "🎉", text: "2K+ events delivered" },
      { icon: "🛡️", text: "Contract-backed service" },
    ],
    equipment: [
      { name: "Cameras", icon: "📷" },
      { name: "Lighting", icon: "💡" },
      { name: "Sound system", icon: "🔊" },
      { name: "Decor kits", icon: "🎀" },
      { name: "Editing suite", icon: "💻" },
      { name: "Backup gear", icon: "🎒" },
    ],
    requirements: [
      { name: "Venue access", icon: "🏛️" },
      { name: "Power backup", icon: "🔋" },
      { name: "Point of contact", icon: "📱" },
    ],
    damageProtection: "Up to ₹15,000 event liability cover for partner-caused equipment damage",
    faqs: [
      {
        question: "Can I customize the package?",
        answer: "Yes — describe add-ons during booking. Final quote shared before confirmation.",
      },
      {
        question: "What is the cancellation policy?",
        answer: "Free reschedule up to 48 hours before slot. Cancellation terms vary by package.",
      },
    ],
  },
  "rental-services": {
    professionalTitle: "Trusted rental partners",
    covered: [
      "Delivery and pickup of {service} items",
      "Basic assembly where applicable",
      "Usage instructions shared on delivery",
      "Replacement for defective unit (subject to stock)",
      "Extension requests via app",
    ],
    notCovered: [
      "Loss or theft of rented items",
      "Damage due to misuse",
      "Delivery beyond service zone without fee",
      "Consumables and fuel",
    ],
    process: [
      "Select items and rental duration",
      "Security deposit and slot confirmation",
      "Delivery with condition checklist",
      "Pickup at end of rental period",
      "Deposit refund after inspection",
    ],
    trustSignals: [
      { icon: "📦", text: "Quality-checked inventory" },
      { icon: "⭐", text: "4.75+ partner ratings" },
      { icon: "🚚", text: "On-time delivery" },
      { icon: "🛡️", text: "Deposit-protected rentals" },
    ],
    equipment: [
      { name: "Rented units", icon: "📦" },
      { name: "Cables & adapters", icon: "🔌" },
      { name: "Covers", icon: "🛡️" },
      { name: "Manuals", icon: "📋" },
      { name: "Spare parts", icon: "🔧" },
      { name: "Trolleys", icon: "🛒" },
    ],
    requirements: [
      { name: "Delivery access", icon: "🚪" },
      { name: "ID verification", icon: "🪪" },
      { name: "Deposit payment", icon: "💳" },
    ],
    damageProtection: "Damage waiver up to ₹8,000 available on select rental categories",
    faqs: [
      {
        question: "Is deposit refundable?",
        answer: "Yes, after pickup inspection if items are returned in acceptable condition.",
      },
      {
        question: "Can I extend the rental?",
        answer: "Extensions can be requested in-app subject to availability.",
      },
    ],
  },
  "vehicle-services": {
    professionalTitle: "Top auto partners",
    covered: [
      "{service} by verified partner",
      "Status updates during service",
      "Standard diagnostic for repair visits",
      "Digital receipt and service notes",
      "Follow-up support for 48 hours",
    ],
    notCovered: [
      "Major part replacements without approval",
      "Towing beyond included distance",
      "Insurance claim processing fees",
      "Illegal or unsafe vehicle requests",
    ],
    process: [
      "Book slot or on-demand request",
      "Partner assigned and ETA shared",
      "On-site or garage service delivery",
      "Payment and invoice generation",
      "Feedback and warranty note",
    ],
    trustSignals: [
      { icon: "🚗", text: "Verified drivers & mechanics" },
      { icon: "⭐", text: "4.8+ ratings" },
      { icon: "🛣️", text: "1M+ trips & jobs" },
      { icon: "🛡️", text: "Insured partners" },
    ],
    equipment: [
      { name: "Diagnostic tools", icon: "📟" },
      { name: "Jack & tools", icon: "🔧" },
      { name: "Cleaning kit", icon: "🧽" },
      { name: "Jump cables", icon: "🔋" },
      { name: "Tyre kit", icon: "🛞" },
      { name: "Safety kit", icon: "🦺" },
    ],
    requirements: [
      { name: "Vehicle access", icon: "🔑" },
      { name: "Parking space", icon: "🅿️" },
      { name: "RC & ID", icon: "🪪" },
    ],
    damageProtection: "Partner liability cover up to ₹10,000 on certified repair visits",
    faqs: [
      {
        question: "Are spare parts included?",
        answer: "Labour and diagnosis included. Parts billed separately with your approval.",
      },
      {
        question: "How fast is roadside assistance?",
        answer: "Average ETA 30–45 minutes in city limits, subject to traffic and availability.",
      },
    ],
  },
  "accommodation-services": {
    professionalTitle: "Verified hosts",
    covered: [
      "Listed {service} with photos and amenities",
      "Check-in coordination",
      "Basic housekeeping on schedule",
      "24×7 host support line",
      "Secure booking via V Solve Hub",
    ],
    notCovered: [
      "Meals unless specified in listing",
      "Long-term lease documentation",
      "Utility overuse charges",
      "Guest policy violations",
    ],
    process: [
      "Browse listing and check availability",
      "Book nights and pay securely",
      "Host confirms and shares check-in details",
      "Stay with on-call support",
      "Checkout and review",
    ],
    trustSignals: [
      { icon: "🏨", text: "Verified listings" },
      { icon: "⭐", text: "4.7+ stay ratings" },
      { icon: "🔑", text: "10K+ check-ins" },
      { icon: "🛡️", text: "Secure payments" },
    ],
    equipment: [
      { name: "Furnished room", icon: "🛏️" },
      { name: "Wi‑Fi", icon: "📶" },
      { name: "Linens", icon: "🧺" },
      { name: "AC/fan", icon: "❄️" },
      { name: "Geyser", icon: "🚿" },
      { name: "Lockers", icon: "🔐" },
    ],
    requirements: [
      { name: "Valid ID", icon: "🪪" },
      { name: "Check-in time", icon: "🕐" },
      { name: "Deposit if any", icon: "💳" },
    ],
    damageProtection: "Deposit protection and dispute support for qualified bookings",
    faqs: [
      {
        question: "Is early check-in available?",
        answer: "Subject to availability — message the host after booking.",
      },
      {
        question: "Can I cancel my stay?",
        answer: "Cancellation terms are shown on each listing before you pay.",
      },
    ],
  },
  "job-opportunities": {
    professionalTitle: "Trusted employers",
    covered: [
      "Curated {service} listings",
      "Apply in one tap with profile",
      "Employer verification badge",
      "Application status tracking",
      "Interview scheduling support",
    ],
    notCovered: [
      "Guaranteed placement",
      "Salary negotiation on your behalf",
      "Relocation costs",
      "Training fees unless stated",
    ],
    process: [
      "Browse openings matched to your profile",
      "Submit application with resume",
      "Employer review and shortlist",
      "Interview rounds coordinated in-app",
      "Offer and onboarding guidance",
    ],
    trustSignals: [
      { icon: "💼", text: "Verified employers" },
      { icon: "⭐", text: "4.6+ company ratings" },
      { icon: "📄", text: "50K+ applications" },
      { icon: "🛡️", text: "Fraud-checked listings" },
    ],
    equipment: [
      { name: "Resume builder", icon: "📝" },
      { name: "Job alerts", icon: "🔔" },
      { name: "Chat", icon: "💬" },
      { name: "Video interview", icon: "📹" },
      { name: "Skills tests", icon: "✅" },
      { name: "Offer letter", icon: "📄" },
    ],
    requirements: [
      { name: "Updated profile", icon: "👤" },
      { name: "Resume", icon: "📋" },
      { name: "Phone verified", icon: "📱" },
    ],
    damageProtection: "Fraud protection — report suspicious listings for full investigation",
    faqs: [
      {
        question: "Is there a fee to apply?",
        answer: "Browsing and applying to most listings is free. Premium features are clearly marked.",
      },
      {
        question: "How long until I hear back?",
        answer: "Typically 3–7 business days depending on the employer and role.",
      },
    ],
  },
  "manpower-support-staff": {
    professionalTitle: "Verified staff",
    covered: [
      "Background-checked {service} personnel",
      "Replacement within 24h if staff is a no-show",
      "Daily attendance reporting",
      "Supervisor helpline",
      "Uniformed staff where applicable",
    ],
    notCovered: [
      "Personal errands outside scope",
      "Equipment not listed in booking",
      "Overtime without pre-approval",
      "Hazardous work without safety plan",
    ],
    process: [
      "Define headcount, shift and duration",
      "Staff matched and shared for approval",
      "Deployment on scheduled date",
      "Daily check-in and feedback",
      "Renewal or closure at end of term",
    ],
    trustSignals: [
      { icon: "👥", text: "Background verified" },
      { icon: "⭐", text: "4.75+ staff ratings" },
      { icon: "🏢", text: "Used by 1K+ businesses" },
      { icon: "🛡️", text: "Insured deployments" },
    ],
    equipment: [
      { name: "Uniforms", icon: "👔" },
      { name: "ID badges", icon: "🪪" },
      { name: "Basic tools", icon: "🧰" },
      { name: "Cleaning kits", icon: "🧹" },
      { name: "Radios", icon: "📻" },
      { name: "Registers", icon: "📋" },
    ],
    requirements: [
      { name: "Worksite briefing", icon: "📋" },
      { name: "Shift timings", icon: "🕐" },
      { name: "Supervisor", icon: "👤" },
    ],
    damageProtection: "Up to ₹5,000 cover for verified staff-related incidental damage",
    faqs: [
      {
        question: "Can I hire for a single day?",
        answer: "Yes — daily and multi-day deployments are supported.",
      },
      {
        question: "What if staff doesn't show up?",
        answer: "Replacement initiated within 24 hours or pro-rata credit applied.",
      },
    ],
  },
  "custom-other-services": {
    professionalTitle: "Expert partners",
    covered: [
      "Custom scope for {service}",
      "Consultation to define deliverables",
      "Matched professional or vendor",
      "Written estimate before work",
      "Escalation support via V Solve Hub",
    ],
    notCovered: [
      "Work without agreed scope",
      "Illegal or unsafe requests",
      "Third-party fees not disclosed upfront",
      "Emergency response under 2 hours (unless emergency booking)",
    ],
    process: [
      "Describe your requirement in detail",
      "Expert call within 2 business hours",
      "Quote and timeline shared for approval",
      "Service delivery as per agreement",
      "Closure survey and invoice",
    ],
    trustSignals: [
      { icon: "✨", text: "Flexible custom jobs" },
      { icon: "⭐", text: "4.7+ partner ratings" },
      { icon: "📞", text: "Dedicated support" },
      { icon: "🛡️", text: "Estimate-backed work" },
    ],
    equipment: [
      { name: "As quoted", icon: "🧰" },
      { name: "Specialist tools", icon: "🔧" },
      { name: "Safety gear", icon: "🦺" },
      { name: "Consumables", icon: "🧴" },
      { name: "Vehicles", icon: "🚐" },
      { name: "Permits", icon: "📄" },
    ],
    requirements: [
      { name: "Clear brief", icon: "📝" },
      { name: "Site access", icon: "🚪" },
      { name: "Decision maker", icon: "📱" },
    ],
    damageProtection: "Work insured up to agreed estimate value after written approval",
    faqs: [
      {
        question: "How is pricing decided?",
        answer: "After consultation you receive a written estimate — no surprise charges.",
      },
      {
        question: "How fast can emergency services arrive?",
        answer: "Emergency bookings are prioritized; ETA confirmed on the support call.",
      },
    ],
  },
};

const SLUG_OVERRIDES: Record<string, Partial<DetailTemplate>> = {
  "cleaning-services": {
    covered: [
      "Hard water stains on tiles and fixtures",
      "Toilet seat — outside & inside",
      "Sink, tiles, taps & other fixtures",
      "Mirrors, windows & glass partitions",
      "Exhaust fan & other hard-to-reach areas",
    ],
    notCovered: [
      "Cement & rust stains",
      "Cabinet interiors, buckets, mugs & stools",
      "Dismantling & cleaning of any appliance",
    ],
    equipment: [
      { name: "Buffing machine", icon: "🌀" },
      { name: "Microfibre cloths", icon: "🧻" },
      { name: "Sponge", icon: "🧽" },
      { name: "Cleaning solutions", icon: "🧴" },
      { name: "Fine brushes", icon: "🖌️" },
      { name: "Wiper", icon: "🧹" },
    ],
    requirements: [
      { name: "Bucket & water", icon: "🪣" },
      { name: "Power point", icon: "🔌" },
      { name: "Ladder or stool", icon: "🪜" },
    ],
    professionalTitle: "Top cleaners",
  },
};

function buildReviews(service: ServiceDetailInput): ServiceDetailContent["reviews"] {
  const count = 3 + (hashSlug(service.slug) % 2);
  return Array.from({ length: count }, (_, i) => ({
    name: pick(REVIEWERS, service.slug, i),
    date: pick(["Jun 15, 2026", "Jun 10, 2026", "May 28, 2026", "May 12, 2026"], service.slug, i),
    rating: 5 - (hashSlug(service.slug + String(i)) % 2),
    text: pick(REVIEW_SNIPPETS, service.slug, i),
    serviceLabel: `For ${service.name}`,
  }));
}

function buildRatingDistribution(rating: number): ServiceDetailContent["ratingDistribution"] {
  const weights = [Math.round(rating * 20), Math.round((5 - rating) * 8), 4, 2, 1];
  const total = weights.reduce((a, b) => a + b, 0);
  const labels = ["5.4 M", "208K", "42K", "18K", "9K"];
  return [5, 4, 3, 2, 1].map((stars, i) => ({
    stars,
    percent: Math.round((weights[i] / total) * 100),
    label: labels[i],
  }));
}

export function buildServiceDetailContent(service: ServiceDetailInput): ServiceDetailContent {
  const base = CATEGORY_TEMPLATES[service.category.slug] ?? CATEGORY_TEMPLATES["custom-other-services"];
  const override = SLUG_OVERRIDES[service.slug] ?? {};
  const merged = { ...base, ...override };

  const rating = 4.75 + (hashSlug(service.slug) % 15) / 100;
  const reviewScale = ["8.2K", "24K", "1.2M", "5.9M", "42K", "156K"];
  const reviewCountLabel = `${pick(reviewScale, service.slug)} reviews`;

  let originalPricePaise: number | null = null;
  let unitPriceLabel: string | null = null;

  if (service.pricePaise > 0) {
    originalPricePaise = Math.round(service.pricePaise * 1.08);
    if (service.unit === "visit" && service.duration >= 60) {
      unitPriceLabel = `${formatUnitPrice(Math.round(service.pricePaise / 2))} per unit`;
    } else if (service.unit === "day") {
      unitPriceLabel = `${formatUnitPrice(service.pricePaise)} per worker/day`;
    } else if (service.unit === "night") {
      unitPriceLabel = `${formatUnitPrice(service.pricePaise)} per night`;
    }
  }

  const mapList = (items: string[]) => items.map((item) => label(item, service.name));

  return {
    rating: Math.round(rating * 100) / 100,
    reviewCountLabel,
    originalPricePaise,
    unitPriceLabel,
    professionalTitle: merged.professionalTitle,
    covered: mapList(merged.covered),
    notCovered: mapList(merged.notCovered),
    process: mapList(merged.process),
    trustSignals: merged.trustSignals,
    equipment: merged.equipment,
    requirements: merged.requirements,
    damageProtection: merged.damageProtection,
    faqs: merged.faqs.map((f) => ({
      question: label(f.question, service.name),
      answer: label(f.answer, service.name),
    })),
    reviews: buildReviews(service),
    ratingDistribution: buildRatingDistribution(rating),
  };
}

function formatUnitPrice(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}
