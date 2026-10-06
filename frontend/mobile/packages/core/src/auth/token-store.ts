import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "vsolve.session";

export async function readSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function writeSessionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, token);
}

export async function deleteSessionToken(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
