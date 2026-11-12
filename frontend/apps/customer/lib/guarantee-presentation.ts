/**
 * Customer-Facing Guarantee Terminology Normalization Layer
 *
 * Normalizes backend policy texts, proposal coverage terms, and status labels
 * into customer-approved Guarantee and Coverage terminology without mutating
 * underlying API data models or relying on fragile inline string replacements.
 */

/**
 * Normalizes a service policy statement into clean customer-facing guarantee text.
 * E.g., "Warranty activation" → "Service guarantee activation"
 * E.g., "30-day warranty on the workmanship" → "30-Day Workmanship Guarantee"
 * E.g., "30-day warranty" → "30-Day Guarantee"
 */
export function formatGuaranteePolicy(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const text = raw.trim();

  if (/^warranty\s+activation$/i.test(text)) {
    return "Service guarantee activation";
  }

  // Standard N-day workmanship guarantee
  const dayMatch = text.match(/^(\d+)[- ]day\s+(?:warranty|guarantee)(?:\s+on\s+(?:the\s+)?workmanship)?$/i);
  if (dayMatch?.[1]) {
    const days = dayMatch[1];
    return text.toLowerCase().includes("workmanship")
      ? `${days}-Day Workmanship Guarantee`
      : `${days}-Day Guarantee`;
  }

  // Generic policy with warranty words replaced cleanly
  return replaceWarrantyTerminology(text);
}

/**
 * Normalizes a tile or badge label (e.g., "30-Day Guarantee").
 */
export function formatGuaranteeBadge(raw: string | null | undefined, fallback = "30-Day Guarantee"): string {
  if (!raw || !raw.trim()) return fallback;
  const dayMatch = raw.match(/(\d+)[- ]day/i);
  if (dayMatch?.[1]) {
    return `${dayMatch[1]}-Day Guarantee`;
  }
  return formatGuaranteePolicy(raw) || fallback;
}

/**
 * Normalizes vendor-authored coverage/warranty terms for display on quotes and estimates.
 * Replaces any occurrence of "warranty" with "guarantee" while preserving the vendor's numbers and details.
 * When empty or null, returns a clear fallback ("No guarantee specified").
 */
export function formatCoverageTerms(terms: string | null | undefined, fallback = "No guarantee specified"): string {
  if (terms === null || terms === undefined || terms.trim() === "") {
    return fallback;
  }
  return replaceWarrantyTerminology(terms.trim());
}

/**
 * Composes a clear, reassuring answer for the service detail FAQ.
 * Example: "Yes. Your service includes a 30-day workmanship guarantee."
 */
export function formatFaqGuaranteeAnswer(policyText: string): string {
  const normalized = formatGuaranteePolicy(policyText);
  if (normalized && normalized.toLowerCase().includes("workmanship guarantee")) {
    return `Yes. Your service includes a ${normalized.toLowerCase()}.`;
  }
  if (normalized) {
    return `Yes. Your service is backed by a ${normalized.toLowerCase()}.`;
  }
  return "Yes. Your service includes a 30-day workmanship guarantee.";
}

/**
 * Context-aware word replacement that replaces 'warranty' -> 'guarantee'
 * and 'warranties' -> 'guarantees' while preserving casing.
 */
export function replaceWarrantyTerminology(input: string): string {
  return input
    .replace(/\bwarranty activation\b/gi, "Service guarantee activation")
    .replace(/\bwarranties\b/gi, (match) => {
      if (match === match.toUpperCase()) return "GUARANTEES";
      if (match[0] === match[0].toUpperCase()) return "Guarantees";
      return "guarantees";
    })
    .replace(/\bwarranty\b/gi, (match) => {
      if (match === match.toUpperCase()) return "GUARANTEE";
      if (match[0] === match[0].toUpperCase()) return "Guarantee";
      return "guarantee";
    });
}

