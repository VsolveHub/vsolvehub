const SESSION_KEY = "vsolve.session";

export async function readSessionToken(): Promise<string | null> {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(SESSION_KEY);
}

export async function writeSessionToken(token: string): Promise<void> {
  sessionStorage.setItem(SESSION_KEY, token);
}

export async function deleteSessionToken(): Promise<void> {
  sessionStorage.removeItem(SESSION_KEY);
}
