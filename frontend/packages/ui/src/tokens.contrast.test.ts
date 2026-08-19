import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Acceptance evidence for the B1 contrast criterion.
 *
 * "Normal text meets WCAG 4.5:1 contrast" is a checkbox that is normally
 * verified by eye and then quietly broken by the next palette edit. This test
 * parses `tokens.css`, resolves the semantic roles down to hex, and asserts
 * every pairing the design system actually uses.
 *
 * WCAG 2.2 thresholds applied here:
 *   4.5:1  normal body text (1.4.3)
 *   3.0:1  large text, >=24px or >=18.66px bold (1.4.3)
 *   3.0:1  non-text UI boundaries and focus indicators (1.4.11)
 */

const tokensCss = readFileSync(
  fileURLToPath(new URL("./tokens.css", import.meta.url)),
  "utf8",
);

/** Parses `--name: value;` declarations, ignoring comments. */
function parseTokens(css: string): Map<string, string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = new Map<string, string>();
  const pattern = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(withoutComments)) !== null) {
    const name = match[1];
    const value = match[2];
    if (name && value) tokens.set(name, value.trim());
  }
  return tokens;
}

const TOKENS = parseTokens(tokensCss);

/** Resolves a token through any chain of `var()` aliases to a literal hex. */
function resolve(name: string, seen = new Set<string>()): string {
  if (seen.has(name)) throw new Error(`Circular token reference at ${name}`);
  seen.add(name);

  const value = TOKENS.get(name);
  if (!value) throw new Error(`Token ${name} is not defined in tokens.css`);

  const varMatch = value.match(/^var\((--[a-z0-9-]+)\)$/i);
  if (varMatch?.[1]) return resolve(varMatch[1], seen);

  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`Token ${name} resolved to "${value}", which is not a 6-digit hex`);
  }
  return value.toLowerCase();
}

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Asserts a pairing, reporting the measured ratio and both resolved hexes. */
function expectContrast(
  foregroundToken: string,
  backgroundToken: string,
  minimum: number,
): number {
  const fg = resolve(foregroundToken);
  const bg = resolve(backgroundToken);
  const ratio = contrastRatio(fg, bg);
  expect(
    ratio,
    `${foregroundToken} (${fg}) on ${backgroundToken} (${bg}) measured ${ratio.toFixed(2)}:1, needs ${minimum}:1`,
  ).toBeGreaterThanOrEqual(minimum);
  return ratio;
}

const BODY_TEXT = 4.5;
const LARGE_TEXT = 3;
const NON_TEXT = 3;

describe("token integrity", () => {
  it("resolves every semantic role to a literal hex", () => {
    const roles = [...TOKENS.keys()].filter((name) => name.startsWith("--color-"));
    expect(roles.length).toBeGreaterThan(40);
    for (const role of roles) {
      expect(() => resolve(role), `${role} must resolve`).not.toThrow();
    }
  });

  it("keeps the brand colours faithful to the logo", () => {
    // Sampled from apps/customer/public/logo-mark.png. If these change, the
    // tokens have drifted from the mark again — which is the bug this palette
    // was built to fix.
    expect(resolve("--color-signal-500")).toBe("#f87000");
    expect(resolve("--color-navy-700")).toBe("#00246b");
  });

  it("maps legacy brand aliases to navy, not orange", () => {
    // Existing markup pairs `bg-brand-600` with `text-white`. On orange that is
    // 2.9:1 and fails; on navy it passes. Remapping must not regress old screens.
    expect(resolve("--color-brand-600")).toBe(resolve("--color-navy-700"));
    expectContrast("--color-warm-0", "--color-brand-600", BODY_TEXT);
  });
});

describe("body text on every surface", () => {
  it("passes on canvas, surface and sunken surfaces", () => {
    for (const surface of ["--color-canvas", "--color-surface", "--color-surface-sunken"]) {
      expectContrast("--color-text", surface, BODY_TEXT);
      expectContrast("--color-text-secondary", surface, BODY_TEXT);
      expectContrast("--color-text-link", surface, BODY_TEXT);
    }
  });

  it("passes for muted text, which is the tightest neutral", () => {
    // `text-muted` is the value most likely to drift below the line. It carries
    // captions and helper copy, which still must be readable.
    expectContrast("--color-text-muted", "--color-surface", BODY_TEXT);
    expectContrast("--color-text-muted", "--color-canvas", BODY_TEXT);
  });
});

describe("actions", () => {
  it("uses dark text on the orange primary action", () => {
    // The whole reason the primary button is not white-on-orange.
    const ratio = expectContrast("--color-action-text", "--color-action", BODY_TEXT);
    expect(ratio).toBeGreaterThan(6);
  });

  it("would have failed with white text on the orange action", () => {
    // Documents the trap. If someone "fixes" the button to white text, this
    // assertion explains why that is wrong.
    const white = resolve("--color-warm-0");
    const action = resolve("--color-action");
    expect(contrastRatio(white, action)).toBeLessThan(BODY_TEXT);
  });

  it("keeps text readable through hover and active states", () => {
    expectContrast("--color-action-text", "--color-action-hover", BODY_TEXT);
    expectContrast("--color-action-text", "--color-action-active", BODY_TEXT);
  });

  it("uses light text on the navy secondary action", () => {
    expectContrast("--color-action-secondary-text", "--color-action-secondary", BODY_TEXT);
    expectContrast("--color-action-secondary-text", "--color-action-secondary-hover", BODY_TEXT);
  });

  it("keeps signal-700 usable when orange text is unavoidable", () => {
    // The only orange step permitted as text on a light surface.
    expectContrast("--color-signal-700", "--color-surface", BODY_TEXT);
  });
});

describe("status roles", () => {
  const statuses = ["info", "success", "warning", "danger"] as const;

  it("passes on its own tinted surface", () => {
    for (const status of statuses) {
      expectContrast(`--color-${status}-text`, `--color-${status}-surface`, BODY_TEXT);
    }
  });

  it("passes on plain white, since banners also appear on cards", () => {
    for (const status of statuses) {
      expectContrast(`--color-${status}-text`, "--color-surface", BODY_TEXT);
    }
  });

  it("gives every status a visible boundary", () => {
    // Plan 03: never communicate state by colour alone. The border is one of the
    // redundant cues, alongside an icon and a text label, so it must be visible.
    for (const status of statuses) {
      expectContrast(`--color-${status}-line`, `--color-${status}-surface`, 1.2);
    }
  });
});

describe("non-text UI", () => {
  it("gives the focus ring 3:1 against both surfaces it lands on", () => {
    expectContrast("--color-focus-ring", "--color-surface", NON_TEXT);
    expectContrast("--color-focus-ring", "--color-canvas", NON_TEXT);
    expectContrast("--color-focus-ring", "--color-surface-sunken", NON_TEXT);
  });

  it("gives strong lines 3:1 for input and control boundaries", () => {
    // A form control's edge is a non-text UI component under 1.4.11. The default
    // hairline is decorative; `line-strong` is what inputs use.
    expectContrast("--color-line-strong", "--color-surface", NON_TEXT);
    expectContrast("--color-line-strong", "--color-canvas", NON_TEXT);
  });

  it("makes a selected state distinguishable from an unselected one", () => {
    expectContrast("--color-selected", "--color-selected-surface", LARGE_TEXT);
    expectContrast("--color-selected", "--color-surface", NON_TEXT);
    // The border half of the same cue. A selected choice card carries a filled
    // radio, a label *and* this edge, so the edge has to actually be visible.
    expectContrast("--color-selected-line", "--color-selected-surface", 1.2);
  });

  it("keeps the emphasised action plate readable", () => {
    // The promoted row on the crew booking form — the one input that opens a
    // dialog — and the chosen visit tier. Body copy sits on it, so it is held to
    // the body threshold rather than to the large-text one.
    expectContrast("--color-text", "--color-action-surface", BODY_TEXT);
    expectContrast("--color-text-secondary", "--color-action-surface", BODY_TEXT);
    expectContrast("--color-action-line", "--color-action-surface", 1.2);
  });

  it("gives the price rail a focus ring that survives a navy ground", () => {
    // `focus-ring` is tuned for light surfaces and measures far under 3:1 on
    // navy-900, so the rail switches rings rather than losing the indicator.
    // Both halves asserted: the inverse ring works on the rail, and the default
    // one demonstrably does not — which is why the switch exists.
    expectContrast("--color-focus-ring-inverse", "--color-navy-900", NON_TEXT);
    expect(
      contrastRatio(resolve("--color-focus-ring"), resolve("--color-navy-900")),
    ).toBeLessThan(NON_TEXT);
  });

  it("separates the canvas from cards sitting on it", () => {
    // Too small a step and cards vanish into the page; too large and the warm
    // neutral reads as a grey box.
    const ratio = contrastRatio(resolve("--color-surface"), resolve("--color-canvas"));
    expect(ratio).toBeGreaterThan(1.01);
    expect(ratio).toBeLessThan(1.3);
  });
});
