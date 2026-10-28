import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider, useTOrDefault } from "./i18n";
import { createTranslator, type Catalog } from "./i18n-core";

const catalog: Catalog = {
  "booking.confirmed": "Booking confirmed",
  "booking.greeting": "Hello {name}, your {service} is booked.",
  "booking.slotsLeft": {
    one: "{count} slot left today",
    other: "{count} slots left today",
  },
  "cart.items": { other: "{count} items" },
};

describe("createTranslator", () => {
  it("resolves a plain message", () => {
    const { t } = createTranslator("en-IN", catalog);
    expect(t("booking.confirmed")).toBe("Booking confirmed");
  });

  it("interpolates named parameters", () => {
    const { t } = createTranslator("en-IN", catalog);
    expect(t("booking.greeting", { name: "Anitha", service: "Switch repair" })).toBe(
      "Hello Anitha, your Switch repair is booked.",
    );
  });

  it("leaves an unsupplied placeholder visible rather than printing undefined", () => {
    const { t } = createTranslator("en-IN", catalog);
    expect(t("booking.greeting", { name: "Anitha" })).toBe(
      "Hello Anitha, your {service} is booked.",
    );
  });

  it("selects plural forms using the locale's rules", () => {
    const { t } = createTranslator("en-IN", catalog);
    expect(t("booking.slotsLeft", { count: 1 })).toBe("1 slot left today");
    expect(t("booking.slotsLeft", { count: 4 })).toBe("4 slots left today");
    expect(t("booking.slotsLeft", { count: 0 })).toBe("0 slots left today");
  });

  it("falls back to `other` when a plural message is used without a count", () => {
    const { t } = createTranslator("en-IN", catalog);
    expect(t("cart.items")).toBe("{count} items");
  });

  it("returns the key for a missing message instead of blank or a crash", () => {
    // A visible key gets reported and fixed; an empty string hides the bug.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { t } = createTranslator("en-IN", catalog);
    expect(t("does.not.exist")).toBe("does.not.exist");
    warn.mockRestore();
  });

  it("formats numbers with Indian grouping", () => {
    const { n } = createTranslator("en-IN", catalog);
    expect(n(123456)).toBe("1,23,456");
  });
});

describe("locale-specific plural rules", () => {
  it("uses the target language's categories, not an English n===1 check", () => {
    // Hindi treats 0 and 1 as the "one" category, unlike English. Hardcoding
    // `count === 1 ? singular : plural` would be wrong here, which is the whole
    // reason this goes through Intl.PluralRules now rather than later.
    const hindi = new Intl.PluralRules("hi-IN");
    expect(hindi.select(0)).toBe("one");
    expect(hindi.select(1)).toBe("one");
    expect(hindi.select(2)).toBe("other");

    const english = new Intl.PluralRules("en-IN");
    expect(english.select(0)).toBe("other");
  });
});

describe("useTOrDefault", () => {
  function CodeLabel() {
    const tf = useTOrDefault();
    return <span>{tf("ui.otpForm.digitCode", "{codeLength}-digit code", { codeLength: 6 })}</span>;
  }

  it("fills the placeholders of its fallback when the app has no entry", () => {
    // The customer app mounts no catalogue: the shared OTP form must still read "6-digit code".
    render(<CodeLabel />);

    expect(screen.getByText("6-digit code")).toBeInTheDocument();
  });

  it("uses the app's own entry when it has one", () => {
    render(
      <I18nProvider locale="en-IN" catalog={{ "ui.otpForm.digitCode": "{codeLength} అంకెల కోడ్" }}>
        <CodeLabel />
      </I18nProvider>,
    );

    expect(screen.getByText("6 అంకెల కోడ్")).toBeInTheDocument();
  });

  it("fills the fallback's placeholders when the catalogue has no entry", async () => {
    // Operations mounts no catalogue, so the shared OTP form rendered
    // "We will send a {codeLength}-digit code by SMS." on its sign-in screen.
    const { renderHook } = await import("@testing-library/react");
    const { useTOrDefault } = await import("./i18n");
    const { result } = renderHook(() => useTOrDefault());

    expect(result.current("ui.otpForm.willSendCode", "We will send a {codeLength}-digit code.", { codeLength: 6 })).toBe(
      "We will send a 6-digit code.",
    );
  });
  });
});
