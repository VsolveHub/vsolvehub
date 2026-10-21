export interface Interview {
  id: string;
  scheduled_date: string;
  start_time: string;
  mode: "IN_PERSON" | "PHONE" | "VIDEO";
  mode_label: string;
  location_text: string;
  note: string;
  status:
    | "PROPOSED"
    | "ACCEPTED"
    | "RESCHEDULE_REQUESTED"
    | "DECLINED"
    | "CANCELLED"
    | "COMPLETED";
  status_label: string;
  candidate_note: string;
  responded_at?: string | null;
  created_at: string;
}

export interface PartnerListingCounts {
  views: number;
  applied: number;
  shortlisted: number;
  interviews: number;
  connected: number;
  matches: number;
}

export interface PartnerListing {
  id: string;
  title: string;
  slug?: string;
  status: "DRAFT" | "PENDING_MODERATION" | "ACTIVE" | "CLOSED" | "EXPIRED" | string;
  poster_name?: string;
  service_name?: string;
  variant_name?: string;
  moderation_status?: string;
  public_state?: string;
  is_premium?: boolean;
  published_at?: string;
  expires_at?: string;
  view_count?: number;
  application_count?: number;
  counts?: PartnerListingCounts;

  salary_min_paise?: number;
  salary_max_paise?: number;
  salary_period?: string;
  salary_display?: string;
  location?: string;
  location_text?: string;
  description?: string;
  requirements?: string;
  structured_fields?: Record<string, any>;
  created_at?: string;

  // A10 fields
  role_template?: string;
  job_category?: string;
  vacancies?: number;
  job_type?: string;
  employment_type?: string; // fallback alias for job_type
  experience_band?: string;
  experience?: string; // fallback alias
  required_skills?: string[];
  preferred_skills?: string[];
  responsibilities?: string[];
  benefits?: string[];
  languages?: string[];
  min_qualification?: string;
  shift?: string;
  work_mode?: string;
  timing_start?: string;
  timing_end?: string;
  weekly_off?: string;
  urgency?: string;
  city?: string;
  area?: string;
}

export interface PartnerApplication {
  id: string;
  listing?: string;
  listing_id?: string;
  listing_title?: string;
  listing_slug?: string;
  applicant_name?: string;
  applicant_phone?: string;
  applicant_email?: string;
  candidate_name?: string; // fallback alias
  candidate_email?: string; // fallback alias
  candidate_phone?: string; // fallback alias
  status:
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "SHORTLISTED"
    | "INTERVIEW"
    | "CONNECTED"
    | "CONTACTED"
    | "REJECTED"
    | "WITHDRAWN"
    | "EXPIRED"
    | string;
  applicant_snapshot?: {
    name?: string;
    phone?: string;
    email?: string;
    experience?: string;
    skills?: string[];
    [key: string]: unknown;
  };
  experience?: string;
  resume_url?: string;
  skills?: string[];
  cover_note?: string;
  contact_revealed_at?: string | null;
  contact_revealed?: boolean;
  withdrawn_at?: string | null;
  created_at: string;
  updated_at?: string;
  interview?: Interview | null;
}

export function snapshotFields(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry == null) continue;
    out[key] = String(entry);
  }
  return out;
}

export interface CandidateMatch {
  profile_id: string;
  display_name: string;
  roles: string[];
  skills: string[];
  experience_band: string;
  qualification: string;
  languages: string[];
  city: string;
  area: string;
  expected_salary_rupees: number;
  available_from: string;
  applied: boolean;
  application_id?: string | null;
  application_status?: string;
  match: {
    score: number;
    level: "STRONG" | "GOOD" | "OTHER";
    matched: string[];
    missing: string[];
  };
  contact_phone?: string;
  resume_url?: string;
  is_contact_locked?: boolean;
}

export interface ListingHome {
  active_listings: number;
  pending_moderation: number;
  new_applications: number;
  plan_limit: number | null;
  can_see_matches: boolean;
  subscription: null | {
    id: string;
    plan_name: string;
    status: string;
    ends_at: string | null;
  };
}

export interface VendorSubscriptionPlan {
  id: string;
  service?: string | null;
  service_name?: string | null;
  service_slug?: string | null;
  code: string;
  name: string;
  price_paise: number;
  duration_days: number;
  max_active_listings: number;
  premium_capabilities: string[];
  premium_price_paise: number;
  details?: Record<string, any>;
  is_active: boolean;
}

export interface VendorSubscription {
  id: string;
  plan: VendorSubscriptionPlan;
  payment_attempt_id?: string | null;
  status: string;
  starts_at: string;
  ends_at?: string | null;
  created_at: string;
}

export function formatSalary(minPaise?: number, maxPaise?: number, display?: string): string {
  if (display) return display;
  if (minPaise == null && maxPaise == null) return "Competitive";
  const minK = minPaise ? `₹${Math.round(minPaise / 100000)}k` : "";
  const maxK = maxPaise ? `₹${Math.round(maxPaise / 100000)}k` : "";
  if (minK && maxK) return `${minK} - ${maxK} / month`;
  return `${minK || maxK} / month`;
}

export function getListingStatusBadge(status?: string): {
  label: string;
  tone: "success" | "warning" | "neutral" | "danger";
} {
  switch ((status ?? "").toUpperCase()) {
    case "ACTIVE":
      return { label: "Active · Hiring", tone: "success" };
    case "PENDING_MODERATION":
      return { label: "Under Review", tone: "warning" };
    case "CLOSED":
      return { label: "Closed", tone: "neutral" };
    case "DRAFT":
      return { label: "Draft", tone: "neutral" };
    default:
      return { label: status ?? "Draft", tone: "neutral" };
  }
}

export function getApplicantStatusBadge(status?: string): {
  label: string;
  tone: "brand" | "success" | "warning" | "neutral" | "danger";
} {
  switch ((status ?? "").toUpperCase()) {
    case "SUBMITTED":
      return { label: "New Applicant", tone: "brand" };
    case "UNDER_REVIEW":
      return { label: "Reviewing", tone: "warning" };
    case "SHORTLISTED":
      return { label: "Shortlisted", tone: "success" };
    case "INTERVIEW":
      return { label: "Interview", tone: "brand" };
    case "CONTACTED":
    case "CONNECTED":
      return { label: "Connected", tone: "success" };
    case "REJECTED":
      return { label: "Rejected", tone: "danger" };
    case "WITHDRAWN":
      return { label: "Withdrawn", tone: "neutral" };
    default:
      return { label: status ?? "Applied", tone: "neutral" };
  }
}
