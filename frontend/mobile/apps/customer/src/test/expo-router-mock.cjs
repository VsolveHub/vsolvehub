const router = {
  push() {},
  replace() {},
  back() {},
  canGoBack() { return true; },
};

function useRouter() {
  return router;
}

function usePathname() {
  return "/";
}

function useLocalSearchParams() {
  return {};
}

function Passthrough({ children }) {
  return children ?? null;
}

module.exports = {
  router,
  useRouter,
  usePathname,
  useLocalSearchParams,
  Slot: Passthrough,
  Stack: Passthrough,
  Link: Passthrough,
  Redirect: () => null,
};

