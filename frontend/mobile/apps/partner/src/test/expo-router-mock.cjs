const router = {
  push() {},
  replace() {},
  back() {},
};

function useRouter() {
  return router;
}

function usePathname() {
  return "/";
}

function Passthrough({ children }) {
  return children ?? null;
}

module.exports = {
  router,
  useRouter,
  usePathname,
  Slot: Passthrough,
  Stack: Passthrough,
  Link: Passthrough,
  Redirect: () => null,
};
