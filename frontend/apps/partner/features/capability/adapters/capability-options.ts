import { WORKSPACE_REGISTRY } from "@/features/workspace/registry";

import type {
  BusinessType,
  BusinessTypeOption,
  CapabilityAsk,
  CapabilityOption,
  CapabilityOptions,
} from "../contract-pending/types";
import { expectedFor, fieldsFor, type BusinessField } from "./business-type";

/**
 * What a Partner may ask to be approved for, as a screen can render it.
 *
 * Closes the presentation half of `M2-FE-103` and `M2-FE-104`.
 *
 * ## The sentence this file exists to keep true
 *
 * *Choosing a skill does not open a workspace.* That is the single most
 * important thing a Partner can misunderstand here, and the misunderstanding is
 * expensive in both directions: someone who thinks selecting "Housekeeping"
 * activated an agency workspace waits for enquiries that will never arrive, and
 * someone who thinks a capability request is just another checkbox skips the
 * review that gates it.
 *
 * So `CapabilityChoice` carries `lifecycleExplanation` — the server's own words —
 * and never a workspace key, an archetype code or anything a person could read
 * as "you now have this". The copy that says a request is reviewed lives on the
 * choice itself, not in a footnote under the list.
 *
 * ## Why fields come from the server
 *
 * `asks_for` decides which extra input a capability needs: crew size for
 * workforce, project value for projects. The client renders the fields the
 * server named. An `if (archetype === "A3_TIME_BLOCK")` here would be the
 * per-archetype branch `SIM-09` removed, and it would be wrong the first time a
 * variant wants both.
 */

export interface BusinessTypeChoice {
  readonly value: BusinessType;
  readonly label: string;
  /** The server's plain-language consequence. Never rewritten here. */
  readonly consequence: string;
  /** Which form fields this type shows. */
  readonly fields: readonly BusinessField[];
  /** Fields the server expects filled. Guidance — the save is never blocked on them. */
  readonly expected: readonly BusinessField[];
}

export function describeBusinessTypes(
  options: readonly BusinessTypeOption[],
): BusinessTypeChoice[] {
  return options.map((option) => ({
    value: option.value,
    label: option.label,
    consequence: option.consequence,
    fields: fieldsFor(option.value),
    expected: expectedFor(option.value),
  }));
}

/** One extra input a capability request needs, described for a form. */
export interface CapabilityAskField {
  readonly name: CapabilityAsk;
  readonly label: string;
  readonly help: string;
  /** Paise on the wire. The form takes rupees and the adapter converts. */
  readonly isMoney: boolean;
}

const ASK_FIELDS: Record<CapabilityAsk, Omit<CapabilityAskField, "name">> = {
  max_crew_size: {
    label: "Most workers you can send at once",
    help: "A realistic number. We use it to stop sending you work you cannot staff.",
    isMoney: false,
  },
  max_project_value_paise: {
    label: "Largest project you want to quote for",
    help: "A ceiling, not a commitment. You will not be shown work far above it.",
    isMoney: true,
  },
};

export interface CapabilityChoice {
  readonly variantId: string;
  readonly variantName: string;
  readonly categoryName: string;
  /** Plain language, server-authored. The only lifecycle wording a Partner sees. */
  readonly lifecycleExplanation: string;
  /**
   * The workspace this would open, named the way the Partner would name it.
   *
   * Null when this build has no screens for the key — in which case the choice
   * is still offered, because Django can approve it and the Partner's account is
   * not limited by which version of the app they happen to be running. It simply
   * cannot promise them a tab it does not have.
   */
  readonly workspaceLabel: string | null;
  readonly requiresInsurance: boolean;
  readonly asks: readonly CapabilityAskField[];
  readonly alreadyRequested: boolean;
  /** True when the Partner is paid by Vsolve rather than directly by the customer. */
  readonly isPlatformPaid: boolean;
}

function toChoice(option: CapabilityOption): CapabilityChoice {
  return {
    variantId: option.variant_id,
    variantName: option.variant_name,
    categoryName: option.category_name,
    lifecycleExplanation: option.lifecycle_explanation,
    workspaceLabel: WORKSPACE_REGISTRY[option.workspace_key]?.label ?? null,
    requiresInsurance: option.requires_insurance,
    asks: option.asks_for.map((name) => ({ name, ...ASK_FIELDS[name] })),
    alreadyRequested: option.already_requested,
    // Read from `commercial_mode`, never derived from the key. This is the field
    // that decides whether the screen promises Vsolve protection or tells the
    // Partner to collect directly, and a client that computed it would keep
    // promising protection straight through a server-side policy change.
    isPlatformPaid: option.commercial_mode === "MANAGED_PAYMENT_REQUIRED",
  };
}

export interface CapabilityOptionsView {
  readonly businessTypes: readonly BusinessTypeChoice[];
  readonly choices: readonly CapabilityChoice[];
  /** Grouped for a list that stays scannable past a handful of services. */
  readonly byCategory: readonly { readonly category: string; readonly choices: readonly CapabilityChoice[] }[];
  readonly isEmpty: boolean;
}

export function describeCapabilityOptions(options: CapabilityOptions): CapabilityOptionsView {
  const choices = options.capabilities.map(toChoice);

  // Insertion-ordered, so the server's ordering survives grouping. Sorting
  // categories alphabetically here would override a deliberate ordering the
  // server may be applying for relevance.
  const groups = new Map<string, CapabilityChoice[]>();
  for (const choice of choices) {
    const existing = groups.get(choice.categoryName);
    if (existing) existing.push(choice);
    else groups.set(choice.categoryName, [choice]);
  }

  return {
    businessTypes: describeBusinessTypes(options.business_types),
    choices,
    byCategory: [...groups].map(([category, entries]) => ({ category, choices: entries })),
    isEmpty: choices.length === 0,
  };
}

/**
 * Rupees to paise for the one money field a capability request carries.
 *
 * Rounded, not truncated, and guarded against the values a numeric input can
 * actually produce — `NaN` from an empty field, a negative from a pasted value.
 * No float crosses the wire; the server stores paise and this is the only place
 * the conversion happens.
 */
export function rupeesToPaise(rupees: number): number | null {
  if (!Number.isFinite(rupees) || rupees <= 0) return null;
  return Math.round(rupees * 100);
}
