"use client";

import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";

import { cursorFromNextUrl } from "./cursor";

/** The envelope every paged list in the contract returns. */
export interface Page<T> {
  next: string | null;
  previous?: string | null;
  results: T[];
}

/** Every row loaded so far, in page order. Exported for tests. */
export function flattenPages<T>(pages: readonly Page<T>[] | undefined): T[] {
  return pages ? pages.flatMap((page) => page.results) : [];
}

/**
 * A newest-first list that loads one page at a time.
 *
 * `fetchPage(cursor)` asks for one page; `cursor` is `undefined` for the first. The hook keeps
 * the pages, flattens them into `items`, and exposes `loadMore` for a "Load more" button. Filters
 * belong in `queryKey` *and* in `fetchPage`, so changing one starts again from page one.
 */
export function usePagedList<T>(
  queryKey: QueryKey,
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>,
  options: { enabled?: boolean } = {},
) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam || undefined),
    initialPageParam: "",
    getNextPageParam: (last: Page<T>) => cursorFromNextUrl(last.next),
    enabled: options.enabled ?? true,
  });
  return {
    items: flattenPages(query.data?.pages),
    /** The first page has arrived but there are more rows on the server. */
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => void query.fetchNextPage(),
    loadingMore: query.isFetchingNextPage,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Rows per public browse page; the server's default and the size the client asks for. */
export const BROWSE_PAGE_SIZE = 24;

/** Where the next browse page starts, or `undefined` once a short page says there is no more. */
export function nextBrowseOffset<T>(
  last: readonly T[],
  all: readonly (readonly T[])[],
  pageSize = BROWSE_PAGE_SIZE,
): number | undefined {
  if (last.length < pageSize) return undefined;
  return all.reduce((sum, page) => sum + page.length, 0);
}

/**
 * A public browse list (rentals, stays, jobs) that grows with "Show more".
 *
 * Browse pages are plain arrays fetched by `limit`/`offset`, because the user picks the sort.
 * A full page means there may be more; a short page is the end.
 */
export function useBrowseList<T>(
  queryKey: QueryKey,
  fetchWindow: (offset: number, limit: number) => Promise<T[]>,
  options: { enabled?: boolean; pageSize?: number } = {},
) {
  const pageSize = options.pageSize ?? BROWSE_PAGE_SIZE;
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchWindow(pageParam, pageSize),
    initialPageParam: 0,
    getNextPageParam: (last: T[], all: T[][]) => nextBrowseOffset(last, all, pageSize),
    enabled: options.enabled ?? true,
  });
  return {
    items: query.data ? query.data.pages.flat() : [],
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => void query.fetchNextPage(),
    loadingMore: query.isFetchingNextPage,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Every page of a small, filtered list — e.g. a home screen's *active* bookings.
 *
 * For summaries that must count all of a bounded set. `maxPages` is a guard, not a feature: if it
 * is ever reached the set was not small, and the screen should page instead.
 */
export async function fetchAllPages<T>(
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>,
  maxPages = 10,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await fetchPage(cursor);
    rows.push(...result.results);
    cursor = cursorFromNextUrl(result.next);
    if (!cursor) break;
  }
  return rows;
}
