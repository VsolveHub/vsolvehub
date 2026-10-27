import { render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { PartnerI18nProvider } from "@/i18n/provider";

import { LanguagePicker } from "./language-picker";

/** I8 — the picker forgot the last choice and its confirm button had no accessible name. */
describe("LanguagePicker", () => {
  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue({ back: vi.fn(), refresh: vi.fn() } as never);
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("preselects the previously saved language", () => {
    // The saved choice arrives as the provider's initial locale (read from the
    // cookie by the root layout).
    render(
      <PartnerI18nProvider initialLocale="hi-IN">
        <LanguagePicker />
      </PartnerI18nProvider>,
    );

    expect(screen.getByRole("button", { name: "हिन्दी" })).toHaveAttribute("aria-pressed", "true");
  });

  it("falls back to the default when nothing is saved", () => {
    render(
      <PartnerI18nProvider initialLocale="en-IN">
        <LanguagePicker />
      </PartnerI18nProvider>,
    );

    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
  });

  it("names the confirm button", () => {
    render(
      <PartnerI18nProvider initialLocale="en-IN">
        <LanguagePicker />
      </PartnerI18nProvider>,
    );

    expect(screen.getByRole("button", { name: "Confirm language" })).toBeInTheDocument();
  });
});
