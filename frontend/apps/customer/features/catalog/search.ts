import type { Category, ServiceCard } from "./queries";

/**
 * Catalog search: matching and ranking, with no data access of its own.
 *
 * ## What this replaces
 *
 * `/catalog?q=` used to filter the **category** list — name, description and
 * subcategory names. That answers a question nobody asks. A person types
 * "geyser" or "deep clean" because they want the *service*, and the category
 * filter either returned the whole of "Home services" or returned nothing at
 * all, both of which read as "we do not do that".
 *
 * ## Why the ranking is here rather than in the page
 *
 * It is the part with behaviour worth pinning down — that an exact name beats a
 * description mention, that "ac" does not rank every service containing those
 * two letters above `AC service`, and that the order is stable when two things
 * score the same. A page cannot be tested for any of that without rendering it.
 *
 * ## Why there is no search endpoint
 *
 * There is no published one. `/api/v1/categories/` and
 * `/api/v1/categories/{slug}/services/` are what the contract offers, both
 * already cached for public reads, and the catalogue is small enough that
 * matching over it costs less than the round trip a dedicated endpoint would
 * add. If the catalogue outgrows that, the fix is a contract proposal for a
 * server-side search — not a bigger fan-out here.
 */

/** A service that matched, with the category it was found under. */
export interface ServiceMatch {
  service: ServiceCard;
  category: Category;
  /** Higher is a better match. Only meaningful relative to the same query. */
  score: number;
}

export interface CatalogSearchResults {
  services: ServiceMatch[];
  /** Categories whose own name or subcategories matched, for a wider look. */
  categories: Category[];
}

/**
 * Scores below this are not matches at all.
 *
 * Kept as a named constant because `0` is a real score in this scheme — a
 * service that matched nothing — and `> 0` buried in a filter reads like a
 * truthiness check rather than the rule it is.
 */
const NO_MATCH = 0;

const SCORE = {
  /** The whole name, exactly. "ac service" typed at `AC service`. */
  exactName: 100,
  /** The name starts with the query. "deep" at `Deep cleaning`. */
  namePrefix: 60,
  /** A word inside the name starts with the query. "clean" at `Deep cleaning`. */
  nameWordPrefix: 40,
  /** The query appears mid-word in the name. Only for queries long enough to mean it. */
  nameSubstring: 25,
  /** A word in the summary starts with the query. */
  descriptionWordPrefix: 12,
  /** The trade the service sits under matched. */
  subcategory: 8,
  /** The category matched. Weakest: it is true of every service under it. */
  category: 4,
} as const;

/**
 * Below four characters, a mid-word match is noise rather than intent.
 *
 * "ac" sits inside "surf**ac**e", so allowing mid-word matches at any length put
 * `Surface cleaning` in the results for someone searching for an air
 * conditioner. Four is where a coincidental hit stops being likely and a
 * deliberate partial — "clean" against a compound name — starts being worth
 * catching. This is the whole reason the rest of the scheme matches on word
 * starts; the substring rung is the exception and has to be bounded.
 */
const MID_WORD_MINIMUM = 4;

/** Lowercased, collapsed whitespace. The one place a query is normalised. */
export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Whether a word in `haystack` starts with `needle`.
 *
 * Word-boundary rather than plain `includes`, because "ac" inside "surface" is
 * not what somebody searching for an air conditioner meant, and a substring
 * match on two letters is enough to make the top of the results look random.
 */
function hasWordStartingWith(haystack: string, needle: string): boolean {
  if (needle === "") return false;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    const before = index === 0 ? " " : haystack[index - 1]!;
    if (!/[a-z0-9]/.test(before)) return true;
    index = haystack.indexOf(needle, index + 1);
  }
  return false;
}

function scoreService(
  service: ServiceCard,
  category: Category,
  query: string,
): number {
  const name = service.name.toLowerCase();

  if (name === query) return SCORE.exactName;
  if (name.startsWith(query)) return SCORE.namePrefix;
  if (hasWordStartingWith(name, query)) return SCORE.nameWordPrefix;
  if (query.length >= MID_WORD_MINIMUM && name.includes(query)) return SCORE.nameSubstring;

  if (hasWordStartingWith(service.short_description.toLowerCase(), query)) {
    return SCORE.descriptionWordPrefix;
  }

  const subcategory = category.subcategories.find(
    (candidate) => candidate.slug === service.subcategory_slug,
  );
  if (subcategory && hasWordStartingWith(subcategory.name.toLowerCase(), query)) {
    return SCORE.subcategory;
  }

  if (hasWordStartingWith(category.name.toLowerCase(), query)) return SCORE.category;

  return NO_MATCH;
}

function categoryMatches(category: Category, query: string): boolean {
  return (
    hasWordStartingWith(category.name.toLowerCase(), query) ||
    hasWordStartingWith(category.description.toLowerCase(), query) ||
    category.subcategories.some((subcategory) =>
      hasWordStartingWith(subcategory.name.toLowerCase(), query),
    )
  );
}

/**
 * Ranks a catalogue against one query.
 *
 * `services` is indexed by category slug — the shape the per-category endpoint
 * returns — so the caller never has to flatten and re-associate.
 *
 * Ties break on name, so the same query always produces the same order. Without
 * that, two equally-good matches swap places between renders and the list looks
 * like it is reshuffling itself.
 */
export function rankCatalogMatches(
  categories: readonly Category[],
  servicesByCategory: ReadonlyMap<string, readonly ServiceCard[]>,
  rawQuery: string,
  options: { limit?: number } = {},
): CatalogSearchResults {
  const query = normalizeQuery(rawQuery);
  if (query === "") return { services: [], categories: [] };

  const matches: ServiceMatch[] = [];
  for (const category of categories) {
    for (const service of servicesByCategory.get(category.slug) ?? []) {
      const score = scoreService(service, category, query);
      if (score > NO_MATCH) matches.push({ service, category, score });
    }
  }

  matches.sort((left, right) =>
    right.score !== left.score
      ? right.score - left.score
      : left.service.name.localeCompare(right.service.name),
  );

  return {
    services: options.limit === undefined ? matches : matches.slice(0, options.limit),
    categories: categories.filter((category) => categoryMatches(category, query)),
  };
}

/**
 * How this service is priced and booked, in the customer's words.
 *
 * Read from `request_archetypes` and `starting_price`, both published, and
 * never guessed: a service with no archetype and no price gets no label rather
 * than a reassuring default. "Fixed price" on something that turns out to need
 * a quote is the kind of small lie a person remembers.
 */
export function bookingModeLabel(service: ServiceCard): string | null {
  if (service.request_archetypes.includes("A3_TIME_BLOCK")) return "Day rate";
  if (service.request_archetypes.includes("A5_CUSTOM_PROJECT")) return "Quoted after visit";
  if (service.starting_price !== null) return "Fixed price";
  return null;
}
