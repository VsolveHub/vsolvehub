export interface FitOutServiceOption {
  value: string;
  label: string;
  description: string;
  eyebrow: string;
  facts: readonly string[];
  included: readonly string[];
  notIncluded: readonly string[];
  faqs: readonly { question: string; answer: string }[];
  palette: readonly [string, string, string];
  imageLabel: string;
}

export const FIT_OUT_SERVICE_OPTIONS: readonly FitOutServiceOption[] = [
  {
    value: "office-fit-out",
    label: "Office fit-out",
    description: "Open desks, meeting rooms, power and data, with a tidy move-in finish.",
    eyebrow: "Move-in ready workspace",
    facts: ["18 desks", "2 meeting rooms", "Power + data"],
    included: [
      "Partition layout",
      "Electrical and data points",
      "Ceiling and lighting",
      "Paint and basic finishes",
    ],
    notIncluded: ["Loose furniture purchase", "IT hardware", "Brand signage"],
    faqs: [
      {
        question: "Can vendors quote after seeing the office?",
        answer: "Yes. The site visit is used to confirm measurements, services and finish levels.",
      },
      {
        question: "Can I change desk count later?",
        answer: "Yes. The quote can be adjusted before you approve the final scope.",
      },
    ],
    palette: ["#0F2742", "#2E5C7A", "#D7E5EF"],
    imageLabel: "Office",
  },
  {
    value: "retail-fit-out",
    label: "Retail fit-out",
    description: "Shopfronts, display walls, lighting and customer flow.",
    eyebrow: "Customer-facing floor",
    facts: ["Display wall", "Front counter", "Lighting plan"],
    included: [
      "Display wall carpentry",
      "Counter placement",
      "Track and ambient lighting",
      "Customer movement plan",
    ],
    notIncluded: ["Inventory racks", "POS machines", "Exterior permissions"],
    faqs: [
      {
        question: "Can this include a shopfront?",
        answer: "Yes, vendors can quote shopfront work after checking site rules and dimensions.",
      },
      {
        question: "Will branding be included?",
        answer: "Basic placement can be planned, but sign fabrication is quoted separately.",
      },
    ],
    palette: ["#5C3317", "#C26B3C", "#F4D3B0"],
    imageLabel: "Retail",
  },
  {
    value: "hospitality-fit-out",
    label: "Hospitality fit-out",
    description: "Counters, seating zones and durable guest-facing finishes.",
    eyebrow: "Guest-facing space",
    facts: ["Seating zones", "Serve counter", "Hard-wearing finishes"],
    included: [
      "Counter and service zones",
      "Guest seating layout",
      "Wall and floor finishes",
      "Lighting mood plan",
    ],
    notIncluded: ["Kitchen equipment", "Food licence work", "Loose tables and chairs"],
    faqs: [
      {
        question: "Can this cover cafes and salons?",
        answer: "Yes. Choose this when the space needs guest-facing counters, seating or finishes.",
      },
      {
        question: "Is kitchen equipment included?",
        answer: "No. Equipment selection and purchase are handled outside this fit-out scope.",
      },
    ],
    palette: ["#214B42", "#6F9B6B", "#E1ECD8"],
    imageLabel: "Hospitality",
  },
  {
    value: "shell-core-completion",
    label: "Shell and core completion",
    description: "Partitions, ceilings, flooring and services brought together for a bare shell.",
    eyebrow: "Bare space finish-out",
    facts: ["Partitions", "Ceilings + flooring", "MEP coordination"],
    included: [
      "Internal partitions",
      "False ceiling scope",
      "Flooring base finish",
      "Electrical and plumbing coordination",
    ],
    notIncluded: ["Structural changes", "Lift or common-area work", "Authority approvals"],
    faqs: [
      {
        question: "Is this right for an empty bare shell?",
        answer: "Yes. This is the closest fit when basic internal finishes still need to be built.",
      },
      {
        question: "Can structural work be added?",
        answer: "No. Vendors can flag it, but structural changes need a separate specialist scope.",
      },
    ],
    palette: ["#38455B", "#7C8CA8", "#E7ECF5"],
    imageLabel: "Shell",
  },
];

export const FIT_OUT_OPTION_BY_VALUE = new Map(
  FIT_OUT_SERVICE_OPTIONS.map((option) => [option.value, option]),
);

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function fitOutServiceArtwork(option: FitOutServiceOption): string {
  const [dark, mid, light] = option.palette;
  const motif =
    option.value === "office-fit-out"
      ? '<rect x="22" y="24" width="50" height="18" rx="4" fill="rgba(255,255,255,0.18)" /><rect x="80" y="24" width="50" height="18" rx="4" fill="rgba(255,255,255,0.18)" /><rect x="138" y="24" width="50" height="18" rx="4" fill="rgba(255,255,255,0.18)" /><rect x="26" y="66" width="46" height="48" rx="8" fill="rgba(255,255,255,0.12)" /><rect x="84" y="66" width="46" height="48" rx="8" fill="rgba(255,255,255,0.12)" /><rect x="142" y="66" width="46" height="48" rx="8" fill="rgba(255,255,255,0.12)" /><path d="M18 132h164" stroke="rgba(255,255,255,0.22)" stroke-width="4" />'
      : option.value === "retail-fit-out"
        ? '<rect x="22" y="28" width="24" height="84" rx="6" fill="rgba(255,255,255,0.14)" /><rect x="54" y="40" width="24" height="72" rx="6" fill="rgba(255,255,255,0.14)" /><rect x="86" y="24" width="24" height="88" rx="6" fill="rgba(255,255,255,0.14)" /><rect x="118" y="38" width="24" height="74" rx="6" fill="rgba(255,255,255,0.14)" /><rect x="150" y="52" width="24" height="60" rx="6" fill="rgba(255,255,255,0.14)" /><path d="M18 132h164" stroke="rgba(255,255,255,0.22)" stroke-width="4" /><circle cx="36" cy="24" r="10" fill="rgba(255,255,255,0.18)" /><circle cx="76" cy="20" r="8" fill="rgba(255,255,255,0.12)" /><circle cx="152" cy="28" r="9" fill="rgba(255,255,255,0.18)" />'
        : option.value === "hospitality-fit-out"
          ? '<path d="M18 110c20-18 44-26 72-26s52 8 72 26v22H18z" fill="rgba(255,255,255,0.16)" /><rect x="26" y="76" width="18" height="30" rx="6" fill="rgba(255,255,255,0.12)" /><rect x="52" y="68" width="18" height="38" rx="6" fill="rgba(255,255,255,0.12)" /><rect x="78" y="62" width="18" height="44" rx="6" fill="rgba(255,255,255,0.12)" /><rect x="104" y="68" width="18" height="38" rx="6" fill="rgba(255,255,255,0.12)" /><rect x="130" y="76" width="18" height="30" rx="6" fill="rgba(255,255,255,0.12)" /><circle cx="40" cy="30" r="7" fill="rgba(255,255,255,0.2)" /><circle cx="100" cy="20" r="7" fill="rgba(255,255,255,0.2)" /><circle cx="160" cy="30" r="7" fill="rgba(255,255,255,0.2)" />'
          : '<rect x="24" y="24" width="152" height="92" rx="12" fill="rgba(255,255,255,0.10)" /><path d="M24 58h152M24 86h152M72 24v92M120 24v92" stroke="rgba(255,255,255,0.2)" /><rect x="34" y="34" width="34" height="18" rx="4" fill="rgba(255,255,255,0.16)" /><rect x="132" y="96" width="34" height="14" rx="4" fill="rgba(255,255,255,0.16)" />';

  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140" fill="none" role="img" aria-label="${escapeXml(option.imageLabel)}">
      <defs>
        <linearGradient id="g" x1="20" y1="18" x2="184" y2="132" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="${dark}" />
          <stop offset="55%" stop-color="${mid}" />
          <stop offset="100%" stop-color="${light}" />
        </linearGradient>
      </defs>
      <rect width="200" height="140" rx="20" fill="url(#g)" />
      <circle cx="176" cy="22" r="26" fill="rgba(255,255,255,0.06)" />
      <circle cx="30" cy="118" r="34" fill="rgba(255,255,255,0.05)" />
      <rect x="18" y="16" width="164" height="108" rx="16" fill="rgba(10,18,32,0.12)" />
      ${option.value === "shell-core-completion" ? '<path d="M24 112l22-24 28 18 24-22 26 14 30-30 24 16" stroke="rgba(255,255,255,0.18)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />' : ""}
      ${motif}
      <text x="24" y="126" fill="rgba(255,255,255,0.94)" font-family="system-ui, sans-serif" font-size="16" font-weight="700">${escapeXml(option.imageLabel)}</text>
      <text x="24" y="36" fill="rgba(255,255,255,0.78)" font-family="system-ui, sans-serif" font-size="10" font-weight="700" letter-spacing="1.2">${escapeXml(option.description)}</text>
    </svg>
  `);
}
