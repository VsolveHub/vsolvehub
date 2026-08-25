import type { CategoryGroup } from "./grouping";

/**
 * The accelerator across the top of the catalogue, and the anchor contract the
 * grid renders against.
 *
 * ## Why anchors, and not a client component
 *
 * A rail that filters would need state, a client boundary and a hydrated tree
 * over four hundred otherwise-static tiles — the exact cost FE-9 rules out. A
 * rail that *jumps* needs none of it: `<a href="#home">` is scroll-into-view
 * implemented by the browser, in the browser, before any JavaScript arrives. It
 * survives a failed bundle, it is a real link (middle-click, long-press, copy
 * link address all work), and it puts the section in the URL so a customer can
 * send "the pet ones" to somebody.
 *
 * The thing it deliberately does not do is mark a chip as the current section.
 * That needs a scroll observer, which needs a client component; and a chip
 * frozen in a selected state that no longer matches what is on screen is worse
 * than no highlight. "All" is tinted because it is always true — this page *is*
 * the whole catalogue, and the category chips move within it rather than
 * filtering it.
 *
 * ## The offset is a shared constant, not a number typed twice
 *
 * Two things stack above a section when an anchor lands: the app header
 * (`min-h-16`) and this rail. An anchor with no `scroll-margin-top` puts the
 * heading underneath both of them, which reads as the jump having overshot by
 * one category. So the rail publishes the offset and the grid applies it to
 * every section — one number, one place, and it cannot drift out of step with
 * the `top-16` below.
 */

/**
 * The section id a chip points at.
 *
 * Distinct from the `catalogue-category-…` id the grid puts on the `<h2>` for
 * `aria-labelledby`: two elements cannot share an id, and the anchor has to land
 * on the section, not on the heading inside it.
 */
export function categorySectionId(slug: string): string {
  return `catalogue-${slug}`;
}

/** What "All" returns to — the page header, above the first category. */
export const CATALOGUE_TOP_ID = "catalogue-top";

/**
 * Clears the sticky app header (4rem) and this rail (~3.5rem) so an anchored
 * heading lands in view rather than beneath them. Applied by the page to its
 * header and by `ServiceGrid` to every section.
 */
export const CATALOGUE_SCROLL_MARGIN_CLASS = "scroll-mt-32";

const CHIP_BASE = [
  // 44px is the floor for a touch target (plan 03). The artboard's 38px chip is
  // a drawing; this is a thumb on a bus.
  "inline-flex min-h-11 shrink-0 items-center rounded-control border px-4",
  "text-sm whitespace-nowrap",
  // Only colours and the press transform move. `transition-all` here would
  // animate the chip's width as the font renders, which is a layout shift.
  "transition-[background-color,border-color,color,transform] duration-fast ease-out",
  "active:scale-[0.97] motion-reduce:transform-none",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
].join(" ");

export interface CategoryRailProps {
  categories: readonly CategoryGroup[];
}

export function CategoryRail({ categories }: CategoryRailProps) {
  // One category means the rail would read "All" and then the name of the only
  // thing on the page. Nothing to accelerate.
  if (categories.length < 2) return null;

  return (
    <nav
      aria-label="Jump to a category"
      className={[
        // Sticks under the app header so the jump is available from anywhere in
        // a very long page, which is the whole point of a rail.
        "sticky top-16 z-10",
        // Bleeds past the page gutter so the row scrolls edge to edge, the way
        // a phone chip rail does, while the chips still start at the gutter.
        "-mx-4 border-b border-line bg-canvas px-4 py-2 sm:-mx-6 sm:px-6",
      ].join(" ")}
    >
      <ul
        className={[
          "flex list-none gap-2 overflow-x-auto",
          // The row is short and the chips are wide; a scrollbar under them
          // costs more height than it earns.
          "[-ms-overflow-style:none] [scrollbar-width:none]",
        ].join(" ")}
      >
        <li className="shrink-0">
          <a
            href={`#${CATALOGUE_TOP_ID}`}
            className={[
              CHIP_BASE,
              "border-selected bg-selected-surface font-bold text-text",
            ].join(" ")}
          >
            All
          </a>
        </li>

        {categories.map((category) => (
          <li key={category.id} className="shrink-0">
            <a
              href={`#${categorySectionId(category.slug)}`}
              className={[
                CHIP_BASE,
                "border-line-strong bg-surface font-semibold text-text-secondary",
                "hover:border-selected hover:bg-selected-surface hover:text-text",
              ].join(" ")}
            >
              {category.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
