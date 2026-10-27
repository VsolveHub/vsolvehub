import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RemoteImage } from "./remote-image";

const R2 = "https://pub-32e84da8140449ddbc61c13539728e0e.r2.dev/Images/Icons/download.png";

describe("RemoteImage", () => {
  it("sends catalogue artwork through the optimizer at the drawn width", () => {
    const { container } = render(<RemoteImage src={R2} alt="" width={56} height={56} />);
    const src = container.querySelector("img")?.getAttribute("src") ?? "";

    expect(src.startsWith("/_next/image?")).toBe(true);
    expect(new URLSearchParams(src.split("?")[1]).get("url")).toBe(R2);
  });

  it("renders an unknown host as-is instead of a broken optimizer URL", () => {
    const { container } = render(
      <RemoteImage src="https://cdn.example/offer.png" alt="" width={56} height={56} />,
    );

    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://cdn.example/offer.png");
  });

  it("does not hide the image until React reports it loaded", () => {
    const { container } = render(<RemoteImage src={R2} alt="" width={56} height={56} />);

    expect(container.querySelector("img")?.className ?? "").not.toContain("opacity-0");
  });
});
