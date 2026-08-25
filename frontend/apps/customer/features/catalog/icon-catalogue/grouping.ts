import type { ServiceIndexItem } from "../queries";

/**
 * The flat service index, folded back into the two levels it was flattened from.
 *
 * `catalog_service_index` returns one row per service, each carrying its
 * category and subcategory denormalised alongside it. That is the right wire
 * shape — one request, no nesting to walk — but it is not a shape a page can
 * render: a section heading needs the services under it, and the row does not
 * know its siblings.
 *
 * Pure and IO-free on purpose. Ordering is the part of this screen most likely
 * to be argued about later, and an argument about ordering should be settled by
 * a test, not by reading a page component.
 *
 * ## The backend owns the order; this file only makes it total
 *
 * Every level publishes a `display_order`, and it is honoured first at every
 * level. It is not, however, guaranteed to be unique — two services in the same
 * subcategory can both sit at 0, and `Array.prototype.sort` being stable then
 * makes their relative order the *server's* row order, which is not a promise
 * any endpoint makes.
 *
 * "Stable because the input happened to arrive that way" is how a grid quietly
 * reshuffles between two deploys that changed nothing. So ties fall through to
 * the name, then to the id — the id being a UUID, which is unique, which makes
 * the comparator a total order. The same catalogue always renders in the same
 * sequence, and nothing depends on how the rows were serialised.
 *
 * ## Conflicting labels resolve to first-seen
 *
 * Each row repeats its category and subcategory name. If two rows disagree —
 * only possible mid-publish, or from a bug — the first occurrence in the
 * response wins rather than the last. The alternative, letting the final row
 * decide, means the heading a customer sees depends on where in the payload the
 * odd row landed. Neither is *correct*; this one is at least deterministic for a
 * given response.
 */

export interface SubcategoryGroup {
  id: string;
  slug: string;
  name: string;
  displayOrder: number;
  /** Ordered by `display_order`, then name, then id. Never empty. */
  services: ServiceIndexItem[];
}

export interface CategoryGroup {
  id: string;
  slug: string;
  name: string;
  displayOrder: number;
  /**
   * Every service beneath this category, across all of its subcategories.
   *
   * Precomputed rather than left to the view, because the section heading shows
   * it and a view that sums nested arrays inline tends to grow a second, subtly
   * different sum somewhere else on the same page.
   */
  serviceCount: number;
  /** Ordered by `display_order`, then name, then id. Never empty. */
  subcategories: SubcategoryGroup[];
}

interface CategoryAccumulator {
  id: string;
  slug: string;
  name: string;
  displayOrder: number;
  subcategories: Map<string, SubcategoryGroup>;
}

/** Just enough of a row to order it. Categories, subcategories and services all qualify. */
interface Ordered {
  displayOrder: number;
  name: string;
  id: string;
}

export function groupServiceIndex(items: readonly ServiceIndexItem[]): CategoryGroup[] {
  const categories = new Map<string, CategoryAccumulator>();

  for (const item of items) {
    let category = categories.get(item.category_id);
    if (category === undefined) {
      category = {
        id: item.category_id,
        slug: item.category_slug,
        name: item.category_name,
        displayOrder: item.category_display_order,
        subcategories: new Map(),
      };
      categories.set(item.category_id, category);
    }

    let subcategory = category.subcategories.get(item.subcategory_id);
    if (subcategory === undefined) {
      subcategory = {
        id: item.subcategory_id,
        slug: item.subcategory_slug,
        name: item.subcategory_name,
        displayOrder: item.subcategory_display_order,
        services: [],
      };
      category.subcategories.set(item.subcategory_id, subcategory);
    }

    subcategory.services.push(item);
  }

  return [...categories.values()]
    .map((category) => {
      const subcategories = [...category.subcategories.values()]
        .map((subcategory) => ({
          ...subcategory,
          services: subcategory.services.sort(compareServices),
        }))
        .sort(compareOrdered);

      return {
        id: category.id,
        slug: category.slug,
        name: category.name,
        displayOrder: category.displayOrder,
        serviceCount: subcategories.reduce(
          (total, subcategory) => total + subcategory.services.length,
          0,
        ),
        subcategories,
      };
    })
    .sort(compareOrdered);
}

function compareOrdered(a: Ordered, b: Ordered): number {
  if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;

  // An explicit locale, because the default depends on the machine the render
  // happens on, and a catalogue that orders differently on a developer's laptop
  // than on the server is a bug nobody can reproduce.
  const byName = a.name.localeCompare(b.name, "en");
  if (byName !== 0) return byName;

  // Two services genuinely can share a name across subcategories, and a
  // collator can also call two distinct strings equal. The id cannot tie.
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function compareServices(a: ServiceIndexItem, b: ServiceIndexItem): number {
  return compareOrdered(
    { displayOrder: a.display_order, name: a.name, id: a.id },
    { displayOrder: b.display_order, name: b.name, id: b.id },
  );
}
