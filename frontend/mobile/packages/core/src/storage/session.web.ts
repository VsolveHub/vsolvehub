/**
 * The browser build keeps the web's own `sessionStorage`, so a reload restores the session
 * exactly as on the website. It throws in some private modes and on a full quota; losing a
 * session value is survivable, so every call tolerates that.
 */
export function sessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function sessionSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* private mode or full quota */
  }
}

export function sessionRemove(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* nothing to remove */
  }
}
