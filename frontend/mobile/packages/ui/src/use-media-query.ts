// Ported from frontend/packages/ui/src/use-media-query.ts
/** Phone layouts always take the narrow answer. `md:` and `lg:` are not used. */
export function useMediaQuery(_query: string): boolean {
  return false;
}

export function useIsWideScreen(): boolean {
  return false;
}
