import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CategoryIcon, CategoryIllustration, ServicePhoto } from "./category-artwork";

describe("category artwork", () => {
  it("renders a category icon with object-contain, never as a cropped photo", () => {
    const { container } = render(
      <CategoryIcon imageUrl="https://cdn.example/Images/Icons/plumber.png" />,
    );
    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toContain("/Icons/");
    expect(image?.className).toContain("object-contain");
    expect(image?.className).not.toContain("object-cover");
  });

  it("renders a fallback glyph when the category has no icon URL", () => {
    const { container } = render(<CategoryIcon imageUrl="" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders desktop illustrations without a nested square tile container", () => {
    const { container } = render(
      <CategoryIllustration
        imageUrl="https://cdn.example/Images/Icons/plumber.png"
        slug="plumber"
        presentation="desktop-card"
        className="h-full w-full"
      />,
    );
    const wrapper = container.firstElementChild;
    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(image?.className).toContain("object-contain");
    expect(wrapper?.className).toContain("flex");
    expect(wrapper?.className).not.toContain("aspect-square");
    expect(wrapper?.className).not.toContain("shadow-xs");
  });

  it("renders a sub-service photograph with object-cover", () => {
    const { container } = render(
      <ServicePhoto imageUrl="https://cdn.example/Images/PlumberServices/tap.jpeg" />,
    );
    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toContain("PlumberServices");
    expect(image?.className).toContain("object-cover");
    expect(image?.className).not.toContain("object-contain");
  });

  it("renders a Service Cover browse tile with object-contain", () => {
    const { container } = render(
      <ServicePhoto imageUrl="https://cdn.example/Images/Service%20Cover/Switch_and_socket.jpeg" />,
    );
    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toContain("Service%20Cover");
    expect(image?.className).toContain("object-contain");
    expect(image?.className).not.toContain("object-cover");
  });
});
