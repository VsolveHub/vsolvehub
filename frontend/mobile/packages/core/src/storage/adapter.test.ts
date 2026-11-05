import AsyncStorage from "@react-native-async-storage/async-storage";
import { storageAdapter } from "./adapter";

describe("storageAdapter", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("sets, gets, and removes values", async () => {
    const key = "test-key";
    const value = JSON.stringify({ hello: "world" });

    expect(await storageAdapter.getItem(key)).toBeNull();

    await storageAdapter.setItem(key, value);
    expect(await storageAdapter.getItem(key)).toBe(value);

    await storageAdapter.removeItem(key);
    expect(await storageAdapter.getItem(key)).toBeNull();
  });

  it("handles storage errors gracefully without throwing", async () => {
    const getItemSpy = jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("Disk error"));
    expect(await storageAdapter.getItem("err-key")).toBeNull();
    getItemSpy.mockRestore();

    const setItemSpy = jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("Disk error"));
    await expect(storageAdapter.setItem("err-key", "val")).resolves.not.toThrow();
    setItemSpy.mockRestore();

    const removeItemSpy = jest.spyOn(AsyncStorage, "removeItem").mockRejectedValueOnce(new Error("Disk error"));
    await expect(storageAdapter.removeItem("err-key")).resolves.not.toThrow();
    removeItemSpy.mockRestore();
  });
});
