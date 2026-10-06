const store = new Map();

const AsyncStorage = {
  getItem: async (key) => (store.has(key) ? store.get(key) : null),
  setItem: async (key, value) => {
    store.set(key, String(value));
  },
  removeItem: async (key) => {
    store.delete(key);
  },
  clear: async () => {
    store.clear();
  },
  getAllKeys: async () => [...store.keys()],
  multiGet: async (keys) => keys.map((key) => [key, store.get(key) ?? null]),
  multiSet: async (pairs) => {
    for (const [key, value] of pairs) store.set(key, String(value));
  },
  multiRemove: async (keys) => {
    for (const key of keys) store.delete(key);
  },
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
