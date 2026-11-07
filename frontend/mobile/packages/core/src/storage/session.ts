/**
 * Values that last for this app session, the phone's equivalent of the web's `sessionStorage`.
 *
 * React Native has no `window.sessionStorage`: calling it throws, so code ported from the web
 * that wraps it in `try/catch` silently stores nothing on a phone. This keeps the same
 * contract: a value survives screens unmounting and remounting, and is gone once the app
 * process ends, just as a closed browser tab forgets its session. Use `kvGet`/`kvSet` for
 * anything that must outlive the app.
 */
const values = new Map<string, string>();

export function sessionGet(key: string): string | null {
  return values.get(key) ?? null;
}

export function sessionSet(key: string, value: string): void {
  values.set(key, value);
}

export function sessionRemove(key: string): void {
  values.delete(key);
}
