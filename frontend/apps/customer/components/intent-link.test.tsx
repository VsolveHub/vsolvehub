import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { IntentLink } from "./intent-link";

// Surfaces the `prefetch` prop IntentLink hands next/link.
vi.mock("next/link", () => ({
  default: ({ prefetch, href, ...props }: ComponentProps<"a"> & { prefetch?: boolean | null }) => (
    <a href={String(href)} data-prefetch={String(prefetch)} {...props} />
  ),
}));

describe("IntentLink", () => {
  it("does not prefetch a link that has only scrolled into view", () => {
    render(<IntentLink href="/catalog/plumber?tile=taps-showers">Taps</IntentLink>);

    expect(screen.getByRole("link")).toHaveAttribute("data-prefetch", "false");
  });

  it.each(["touchStart", "mouseEnter", "focus"] as const)(
    "switches Next's default prefetch on at %s",
    (intent) => {
      render(<IntentLink href="/catalog/plumber?tile=taps-showers">Taps</IntentLink>);
      const link = screen.getByRole("link");

      fireEvent[intent](link);

      expect(link).toHaveAttribute("data-prefetch", "null");
    },
  );

  it("still runs the caller's own handlers", () => {
    const onTouchStart = vi.fn();
    render(
      <IntentLink href="/catalog/plumber" onTouchStart={onTouchStart}>
        Plumber
      </IntentLink>,
    );

    fireEvent.touchStart(screen.getByRole("link"));

    expect(onTouchStart).toHaveBeenCalledOnce();
  });
});
