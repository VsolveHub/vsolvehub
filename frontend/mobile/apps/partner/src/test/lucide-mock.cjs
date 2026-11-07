function Icon() {
  return null;
}

module.exports = new Proxy(
  { __esModule: true },
  {
    get(target, prop) {
      if (prop === "__esModule") return true;
      if (prop in target) return target[prop];
      return Icon;
    },
  },
);
