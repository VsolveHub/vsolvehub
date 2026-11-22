const router = {
  push: typeof jest !== "undefined" ? jest.fn() : () => {},
  replace: typeof jest !== "undefined" ? jest.fn() : () => {},
  back: typeof jest !== "undefined" ? jest.fn() : () => {},
};

let currentPathname = "/";

function setPathname(p) {
  currentPathname = p;
}

function usePathname() {
  return currentPathname;
}

function useRouter() {
  return router;
}

function Passthrough({ children }) {
  return children ?? null;
}

module.exports = {
  router,
  useRouter,
  usePathname,
  setPathname,
  Slot: Passthrough,
  Stack: Passthrough,
  Link: Passthrough,
  Redirect: () => null,
};
