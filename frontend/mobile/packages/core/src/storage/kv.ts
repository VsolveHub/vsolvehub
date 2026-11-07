import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "vsolve.kv.";

export async function kvGet(key: string): Promise<string | null> {
  return AsyncStorage.getItem(PREFIX + key);
}

export async function kvSet(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(PREFIX + key, value);
}

export async function kvRemove(key: string): Promise<void> {
  await AsyncStorage.removeItem(PREFIX + key);
}
