import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const jobRoutes = [
  new URL("../../app/(flow)/jobs/[engagementId]/page.tsx", import.meta.url),
  new URL("../../app/(flow)/jobs/[engagementId]/receipt/page.tsx", import.meta.url),
  new URL(
    "../../app/(flow)/jobs/[engagementId]/stages/[stageId]/page.tsx",
    import.meta.url,
  ),
];

describe("customer job route configuration", () => {
  for (const route of jobRoutes) {
    it(`${route.pathname} declares dynamic rendering locally`, () => {
      const source = readFileSync(route, "utf8");

      expect(source).toContain('export const dynamic = "force-dynamic";');
      expect(source).not.toMatch(/export\s*\{[^}]*\bdynamic\b[^}]*\}\s*from/);
    });
  }
});
