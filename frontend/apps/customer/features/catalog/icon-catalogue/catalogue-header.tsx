"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { SearchInput } from "@/features/session/view/search-input";

import { CATALOGUE_SCROLL_MARGIN_CLASS, CATALOGUE_TOP_ID } from "./category-rail";

/**
 * The catalogue's app bar: the page name, and search folded behind an icon.
 *
 * The artboard draws exactly two things up here — "All services" and a
 * magnifier — because search on this screen is an accelerator, not the way in.
 * Every service below is reachable by scrolling, so the input only takes up a
 * row once somebody asks for it. FE-9 words the same rule as "optional, never
 * the default empty state".
 *
 * ## Client, but a small one
 *
 * The toggle is state and `SearchInput` needs the router, so this little bar
 * hydrates. The four hundred tiles below it stay server-rendered; the boundary
 * is drawn here precisely so the cost stops here.
 *
 * ## Closing the search abandons it
 *
 * With `?q=` in the URL the grid is replaced by results, and a closed search
 * box over filtered results would look like a broken catalogue. So the box
 * opens itself whenever a query is active, and dismissing it clears the query
 * rather than merely hiding the input.
 */
export function CatalogueHeader() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasQuery = (searchParams.get("q") ?? "").trim() !== "";
  // `?search=1` is the header's search button: arrive with the box already open.
  const [wantsSearch, setWantsSearch] = useState(hasQuery || searchParams.get("search") === "1");

  const open = wantsSearch || hasQuery;

  const toggle = () => {
    if (open && hasQuery) router.push("/catalog");
    setWantsSearch(!open);
  };

  return (
    <header id={CATALOGUE_TOP_ID} className={`flex flex-col gap-3 ${CATALOGUE_SCROLL_MARGIN_CLASS}`}>
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-[19px] font-extrabold tracking-tight text-text">
          All services
        </h1>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? "Close search" : "Search services"}
          className={[
            "flex size-11 shrink-0 items-center justify-center rounded-control",
            "text-text-secondary transition-colors duration-fast",
            "hover:bg-surface-hover hover:text-text",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          ].join(" ")}
        >
          {open ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-6"
              aria-hidden
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-6"
              aria-hidden
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          )}
        </button>
      </div>

      {open ? <SearchInput /> : null}
    </header>
  );
}
