import { render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { LanguagePicker } from "./language-picker";

/** I8 — the picker forgot the last choice and its confirm button had no accessible name. */
describe("LanguagePicker", () => {
  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue({ back: vi.fn() } as never);
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("preselects the previously saved language", () => {
    window.localStorage.setItem("vsh-partner-locale", "hi-IN");

    render(<LanguagePicker />);

    expect(screen.getByRole("button", { name: "हिन्दी" })).toHaveAttribute("aria-pressed", "true");
  });

  it("falls back to the default when nothing is saved", () => {
    render(<LanguagePicker />);

    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
  });

  it("names the confirm button", () => {
    render(<LanguagePicker />);

    expect(screen.getByRole("button", { name: "Confirm language" })).toBeInTheDocument();
  });
});
