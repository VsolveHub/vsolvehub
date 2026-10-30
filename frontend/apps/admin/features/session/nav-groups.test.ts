import { describe, expect, it } from "vitest";

import { NAV_GROUPS, isNavLinkActive } from "./nav-groups";

const link = (href: string) => {
  const found = NAV_GROUPS.flatMap((group) => group.links).find((entry) => entry.href === href);
  if (!found) throw new Error(`no nav link ${href}`);
  return found;
};

describe("operations navigation", () => {
  it("lists every href once", () => {
    const hrefs = NAV_GROUPS.flatMap((group) => group.links.map((entry) => entry.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("lights only the most specific entry", () => {
    expect(isNavLinkActive(link("/operations/partners/import"), "/operations/partners/import")).toBe(true);
    expect(isNavLinkActive(link("/operations/partners"), "/operations/partners/import")).toBe(false);
    expect(isNavLinkActive(link("/operations/partners"), "/operations/partners")).toBe(true);
  });

  it("keeps a section lit on its sub-pages", () => {
    expect(isNavLinkActive(link("/operations/requests"), "/operations/requests/abc/assisted-quote")).toBe(true);
    expect(isNavLinkActive(link("/operations/cases"), "/operations/cases/money")).toBe(true);
    expect(isNavLinkActive(link("/operations/dashboards/overview"), "/operations/dashboards/vendor")).toBe(true);
  });

  it("lights Home only on the home page", () => {
    expect(isNavLinkActive(link("/"), "/")).toBe(true);
    expect(isNavLinkActive(link("/"), "/operations/cases")).toBe(false);
  });
});
