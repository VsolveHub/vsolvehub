import Link from "next/link";

/**
 * Breadcrumb trail.
 *
 * Emits `BreadcrumbList` structured data alongside the visible markup so search
 * results show the catalogue hierarchy rather than a bare URL. The two are
 * generated from one array, so they cannot disagree — a hand-maintained
 * duplicate JSON-LD block is how structured data ends up describing a page that
 * no longer exists.
 *
 * The last item is the current page: rendered as text with `aria-current`, not
 * as a link to where the user already is.
 */

export interface Crumb {
  label: string;
  href: string;
}

export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.label,
      item: crumb.href,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Values are our own labels and slugs, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-text-secondary">
          {trail.map((crumb, index) => {
            const isCurrent = index === trail.length - 1;
            return (
              <li key={crumb.href} className="flex items-center gap-1">
                {index > 0 ? (
                  <span aria-hidden className="text-text-muted">
                    /
                  </span>
                ) : null}
                {isCurrent ? (
                  <span aria-current="page" className="font-medium text-text">
                    {crumb.label}
                  </span>
                ) : (
                  <Link href={crumb.href} className="hover:text-text-link hover:underline">
                    {crumb.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
