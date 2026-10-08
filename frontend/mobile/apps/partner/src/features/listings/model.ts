export interface PartnerListing {
  id: string;
  title: string;
  slug?: string;
  status: "DRAFT" | "PENDING_MODERATION" | "ACTIVE" | "CLOSED" | "EXPIRED" | string;
  employment_type?: string;
  work_mode?: string;
  role_type?: string;
  salary_min_paise?: number;
  salary_max_paise?: number;
  salary_period?: string;
  salary_display?: string;
  application_count?: number;
  location?: string;
  location_text?: string;
  experience?: string;
  description?: string;
  requirements?: string;
  structured_fields?: Record<string, any>;
  created_at?: string;
}

export interface PartnerApplication {
  id: string;
  listing_id?: string;
  candidate_name?: string;
  candidate_email?: string;
  candidate_phone?: string;
  status: "SUBMITTED" | "UNDER_REVIEW" | "SHORTLISTED" | "CONTACTED" | "REJECTED" | "WITHDRAWN" | string;
  experience?: string;
  resume_url?: string;
  skills?: string[];
  cover_note?: string;
  contact_revealed?: boolean;
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
    case "CONTACTED":
      return { label: "Contacted", tone: "success" };
    case "REJECTED":
      return { label: "Rejected", tone: "danger" };
    case "WITHDRAWN":
      return { label: "Withdrawn", tone: "neutral" };
    default:
      return { label: status ?? "Applied", tone: "neutral" };
  }
}
