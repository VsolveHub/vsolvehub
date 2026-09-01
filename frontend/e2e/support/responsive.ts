import { expect, test, type Page } from "@playwright/test";

/**
 * Responsive and accessibility verification, shared by the three app specs.
 *
 * Each app runs it against its own routes because Playwright gives every project
 * one `baseURL`; this module holds the assertions so the three specs cannot
 * drift apart on what "passes" means.
 *
 * ## What is in scope
 *
 * Only routes that render without a session and without an unpublished endpoint.
 * That is not a convenience — a route needing BE-01 or BE-06 cannot be exercised
 * honestly today, and fabricating a session to make it paint would test the
 * fabrication. The Partner `/apply` tree and the booking workspace past the
 * address stage are therefore absent, and stay absent until FE-05.
 *
 * ## What each assertion protects
 *
 * - **Horizontal overflow** is measured against `documentElement.scrollWidth`,
 *   not eyeballed, at the four widths the completion gate names. A page that
 *   scrolls sideways on a phone puts the primary action off-screen.
 * - **200% zoom** is emulated as a halved viewport, which is what browser zoom
 *   does to the CSS pixel box (WCAG 1.4.4).
 * - **Keyboard reachability** tabs from the top and requires a *visible*
 *   indicator. `outline: none` with nothing replacing it is the classic
 *   regression: focus moves and a keyboard user cannot see where.
 * - **Reduced motion** catches an infinite animation still running after someone
 *   asked the OS to stop moving things.
 * - **One `h1` and one `main`** are the two structural facts a screen-reader user
 *   navigates by, and the two most easily broken by a layout refactor.
 */

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 667 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1024", width: 1024, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
] as const;

/** 200% browser zoom halves the CSS pixel box the page is laid out in. */
const ZOOMED_200 = { name: "zoom-200", width: 640, height: 512 } as const;

/** Elements sticking out past the viewport, named so a failure says which one. */
async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    return [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        // Anything deliberately scrolled inside its own container is fine; that
        // is the fix for wide content, not a defect.
        if (element.closest("[class*='overflow-x-auto'], [class*='overflow-auto']")) {
          return false;
        }
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.right > limit + 1;
      })
      .slice(0, 5)
      .map((element) => {
        const id = element.id ? `#${element.id}` : "";
        const classes =
          typeof element.className === "string"
            ? element.className.split(/\s+/).filter(Boolean).slice(0, 3).join(".")
            : "";
        return `${element.tagName.toLowerCase()}${id}${classes ? `.${classes}` : ""}`;
      });
  });
}

export interface RouteUnderTest {
  path: string;
  /** Proves the page rendered rather than 404'd or hung. */
  ready: (page: Page) => Promise<void>;
}

/** The default readiness check: a level-one heading painted. */
export const hasHeading = async (page: Page): Promise<void> => {
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
};

export function verifyResponsiveAccessibility(appName: string, routes: RouteUnderTest[]): void {
  for (const route of routes) {
    test.describe(`${appName} ${route.path}`, () => {
      for (const viewport of [...VIEWPORTS, ZOOMED_200]) {
        test(`has no horizontal overflow at ${viewport.name}`, async ({ page }) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.goto(route.path, { waitUntil: "domcontentloaded" });
          await route.ready(page);

          const overflow = await page.evaluate(() => {
            const doc = document.documentElement;
            return doc.scrollWidth - doc.clientWidth;
          });

          const offenders = overflow > 0 ? await overflowingElements(page) : [];
          expect(
            overflow,
            `${appName} ${route.path} @ ${viewport.name} scrolls horizontally by ` +
              `${overflow}px. Widest offenders: ${offenders.join(", ") || "none identified"}`,
          ).toBeLessThanOrEqual(0);
        });
      }

      test("has one main landmark and one level-one heading", async ({ page }) => {
        await page.goto(route.path, { waitUntil: "domcontentloaded" });
        await route.ready(page);

        await expect(page.locator("main")).toHaveCount(1);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      });

      test("is reachable by keyboard with a visible focus indicator", async ({ page }) => {
        await page.goto(route.path, { waitUntil: "domcontentloaded" });
        await route.ready(page);

        const interactiveCount = await page
          .locator("a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])")
          .count();

        if (interactiveCount === 0) {
          // A deliberately non-interactive holding page — today, only the
          // Operations entry screen, which has no sign-in until BE-02 publishes
          // the session contract. Having nothing to tab to is correct there, and
          // asserting it explicitly stops the case passing silently: the moment a
          // control is added, this branch stops running and the real focus-ring
          // assertion below takes over.
          await page.keyboard.press("Tab");
          await expect(page.locator(":focus-visible")).toHaveCount(0);
          return;
        }

        await page.keyboard.press("Tab");
        const focused = page.locator(":focus-visible");
        await expect(focused).toHaveCount(1);

        // `outline: none` with nothing replacing it is the classic regression:
        // focus moves and a keyboard user cannot see where.
        const hasVisibleIndicator = await focused.evaluate((element) => {
          const style = getComputedStyle(element);
          const outline =
            style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth || "0") > 0;
          const ring = style.boxShadow !== "none" && style.boxShadow.length > 0;
          return outline || ring;
        });

        expect(
          hasVisibleIndicator,
          `${appName} ${route.path}: the first tab stop has no visible focus indicator`,
        ).toBe(true);
      });

      test("stops infinite animation when reduced motion is requested", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(route.path, { waitUntil: "domcontentloaded" });
        await route.ready(page);

        const running = await page.evaluate(
          () =>
            document
              .getAnimations()
              .filter((animation) => {
                if (animation.playState !== "running") return false;
                const iterations = animation.effect?.getComputedTiming().iterations ?? 0;
                return iterations > 100 || iterations === Infinity;
              })
              .length,
        );

        expect(
          running,
          `${appName} ${route.path}: an infinite animation kept running under reduced motion`,
        ).toBe(0);
      });
    });
  }
}
