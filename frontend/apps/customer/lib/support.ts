/**
 * How people reach V Solve Hub.
 *
 * One module, so the Contact page, the legal pages, receipts and the in-booking help sheets can
 * never publish two different channels. Email is support@ for everything. The phone line is the
 * team's current number unless `NEXT_PUBLIC_SUPPORT_PHONE` replaces it; set that variable to an
 * empty string and every call and WhatsApp button disappears with the number — a published number
 * that rings out is worse than none.
 */

/** The team's support line today (owner, 2026-10-26). */
const DEFAULT_SUPPORT_PHONE = "+918790564634";

export interface SupportPhone {
  /** E.164, e.g. `+919876543210`. */
  e164: string;
  /** `+91 879 056 4634` for an Indian number, the grouping the partner site uses; else as given. */
  display: string;
  telHref: string;
  whatsappHref: string;
}

function supportPhone(raw: string | undefined): SupportPhone | null {
  const e164 = (raw ?? "").replace(/[\s-]/g, "");
  if (!/^\+\d{8,15}$/.test(e164)) return null;
  const indian = /^\+91(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return {
    e164,
    display: indian ? `+91 ${indian[1]} ${indian[2]} ${indian[3]}` : e164,
    telHref: `tel:${e164}`,
    whatsappHref: `https://wa.me/${e164.slice(1)}`,
  };
}

const grievanceOfficerName = (process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME ?? "").trim();

export const SUPPORT = {
  /** Support, privacy requests and grievances all go here until more mailboxes exist. */
  email: "support@vsolvehub.com",
  /** `null` only when `NEXT_PUBLIC_SUPPORT_PHONE` is set empty (or to something unusable). */
  phone: supportPhone(process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? DEFAULT_SUPPORT_PHONE),
  /** When the phone line is answered. Only ever shown beside a configured number. */
  phoneHours: "9am–9pm, every day",
  /** What a person writing in can expect. A promise, so it must stay one the team keeps. */
  replyTime: "within one business day",
  /**
   * The Grievance Officer the Consumer Protection (E-Commerce) Rules, 2020 require an e-commerce
   * platform to name. `name` is `null` until `NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME` is set; the role
   * and the address to write to are published either way.
   */
  grievanceOfficer: {
    name: grievanceOfficerName || null,
    designation: "Grievance Officer",
  },
} as const;

/** "Asha Rao, Grievance Officer" once named; "our Grievance Officer" until then. */
export function grievanceOfficerLabel(): string {
  const { name, designation } = SUPPORT.grievanceOfficer;
  return name ? `${name}, ${designation}` : `our ${designation}`;
}
