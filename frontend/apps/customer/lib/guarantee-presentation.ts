/**
 * Customer-Facing Terminology Layer
 *
 * Strips fake guarantees, warranties, and post-work promises so customers
 * see only factual terms without platform-backed warranty claims.
 */

/**
 * Checks a service policy statement. Returns null if the policy represents
 * an after-work guarantee, warranty, or rework promise.
 */
export function formatGuaranteePolicy(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const text = raw.trim();

  // If it mentions warranty, guarantee, or rework, return null so it is not rendered.
  if (/(?:warranty|guarantee|workmanship)/i.test(text)) {
    return null;
  }

  return text;
}

/**
 * Normalizes vendor-authored terms for display on quotes and estimates.
 * Returns empty string when empty or null, and never generates guarantee text.
 */
export function formatCoverageTerms(terms: string | null | undefined): string {
  if (terms === null || terms === undefined || terms.trim() === "") {
    return "";
  }
  const cleaned = terms.trim();
  // Strip out any fake guarantee claims
  if (/(?:warranty|guarantee|workmanship)/i.test(cleaned)) {
    return "";
  }
  return cleaned;
}
