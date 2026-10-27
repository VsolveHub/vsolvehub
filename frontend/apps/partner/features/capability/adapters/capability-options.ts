import type { Translator } from "@vsolve/ui";

import { WORKSPACE_REGISTRY } from "@/features/workspace/registry";

import { expectedFor, fieldsFor, type BusinessField } from "./business-type";
import {
  readRegistrationQuestions,
  type RegistrationQuestionSet,
} from "./registration-questions";
import {
  readBusinessType,
  readCapabilityAsk,
  type BusinessType,
  type BusinessTypeOption,
  type CapabilityAsk,
  type CapabilityOption,
  type CapabilityOptions,
} from "./wire";

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

/**
 * The business types the server offers, dropping any this build cannot render.
 *
 * `BusinessTypeOption.value` is a bare `string` on the wire. A fourth type from
 * a newer deployment has no field set here and no constraint knowledge, so
 * rendering it would offer a radio button that saves a profile whose required
 * fields the form never asked for. Dropping it costs an option; guessing costs a
 * Partner filed under a business type nobody described to them.
 */
export function describeBusinessTypes(
  options: readonly BusinessTypeOption[],
): BusinessTypeChoice[] {
  return options.flatMap((option): BusinessTypeChoice[] => {
    const value = readBusinessType(option.value);
    if (value === null) return [];

    return [
      {
        value,
        label: option.label,
        consequence: option.consequence,
        fields: fieldsFor(value),
        expected: expectedFor(value),
      },
    ];
  });
}

/** One extra input a capability request needs, described for a form. */
export interface CapabilityAskField {
  readonly name: CapabilityAsk;
  readonly label: string;
  readonly help: string;
  /** Paise on the wire. The form takes rupees and the adapter converts. */
  readonly isMoney: boolean;
}

function askFields(t: Translator["t"]): Record<CapabilityAsk, Omit<CapabilityAskField, "name">> {
  return {
    max_crew_size: {
      label: t("me.capability.ask.maxCrewSize.label"),
      help: t("me.capability.ask.maxCrewSize.help"),
      isMoney: false,
    },
    max_project_value_paise: {
      label: t("me.capability.ask.maxProjectValue.label"),
      help: t("me.capability.ask.maxProjectValue.help"),
      isMoney: true,
    },
  };
}

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
  /**
   * Category-specific questions this variant asks at registration.
   *
   * Server-authored on the versioned schema (contract 1.23.0). This is what
   * makes `M2-FE-105`'s "category-specific steps" possible without a client-side
   * branch per category — a construction variant asking for a safety
   * certificate and an events variant asking for venue cover are one form here.
   */
  readonly registrationQuestions: RegistrationQuestionSet;
  readonly alreadyRequested: boolean;
  /** True when the Partner is paid by Vsolve rather than directly by the customer. */
  readonly isPlatformPaid: boolean;
}

function toChoice(option: CapabilityOption, t: Translator["t"]): CapabilityChoice {
  const ASK_FIELDS = askFields(t);
  return {
    variantId: option.variant_id,
    variantName: option.variant_name,
    categoryName: option.category_name,
    lifecycleExplanation: option.lifecycle_explanation,
    workspaceLabel: WORKSPACE_REGISTRY[option.workspace_key]?.label ?? null,
    requiresInsurance: option.requires_insurance,
    // `asks_for` is a bare `string[]`. A name with no control here is dropped
    // rather than rendered as an unlabelled box — the server still validates the
    // request, so the refusal is honest and the form never asks for something it
    // cannot explain.
    asks: option.asks_for.flatMap((name): CapabilityAskField[] => {
      const ask = readCapabilityAsk(name);
      return ask === null ? [] : [{ name: ask, ...ASK_FIELDS[ask] }];
    }),
    registrationQuestions: readRegistrationQuestions(option.registration_questions),
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

export function describeCapabilityOptions(
  options: CapabilityOptions,
  t: Translator["t"],
): CapabilityOptionsView {
  const choices = options.capabilities.map((option) => toChoice(option, t));

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
