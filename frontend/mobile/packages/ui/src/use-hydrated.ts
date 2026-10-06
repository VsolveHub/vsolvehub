// Ported from frontend/packages/ui/src/use-hydrated.ts
/** Phone builds have no server render, so the client is always hydrated. */
export function useHydrated(): boolean {
  return true;
}
