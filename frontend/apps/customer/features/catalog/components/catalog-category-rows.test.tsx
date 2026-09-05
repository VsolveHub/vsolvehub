import { fixtures } from "@vsolve/testing";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Category } from "../queries";
import { CatalogCategoryRows } from "./catalog-category-rows";

function subcategory(index: number) {
  return fixtures.subcategory({
    id: `subcategory-${index}`,
    slug: `subcategory-${index}`,
    name: `Subcategory ${index}`,
    service_count: 1,
  });
}

function category(overrides: Partial<Category> = {}): Category {
  return fixtures.category({
    slug: "electrician",
    name: "Electrician",
    subcategories: Array.from({ length: 8 }, (_value, index) => subcategory(index + 1)),
    ...overrides,
  });
}

describe("catalog category rows", () => {
  it("renders one section per main category and only subcategory links", () => {
    render(
      <CatalogCategoryRows
        categories={[
          category(),
          category({
            id: "category-beauty",
            slug: "beautician",
            name: "Beautician",
            subcategories: [subcategory(9)],
          }),
        ]}
      />,
    );

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["Electrician", "Beautician"]);
    expect(screen.queryByText("Switch Board Repair")).not.toBeInTheDocument();
  });

  it("opens the selected subcategory through the existing category page", () => {
    render(<CatalogCategoryRows categories={[category()]} />);

    expect(screen.getByRole("link", { name: "Subcategory 1" })).toHaveAttribute(
      "href",
      "/catalog/electrician?tile=subcategory-1",
    );
  });

  it("puts every subcategory in the row and links to the complete category", () => {
    // The row used to render six and hide the rest behind breakpoint classes, so a
    // category with more gave no sign the others existed. It scrolls now, so nothing is
    // withheld — and "See all" stays, because the category page is still the better
    // place to browse a long list.
    render(<CatalogCategoryRows categories={[category()]} />);

    const section = screen.getByRole("region", { name: "Electrician" });
    expect(screen.getByRole("link", { name: "Subcategory 7" })).toBeInTheDocument();
    // Seven subcategories plus the see-all link.
    expect(within(section).getAllByRole("link")).toHaveLength(8);
    expect(
      screen.getByRole("link", { name: "See all Electrician subcategories" }),
    ).toHaveAttribute("href", "/catalog/electrician");
  });

  it("does not render empty subcategories or an unnecessary see-all link", () => {
    render(
      <CatalogCategoryRows
        categories={[
          category({
            subcategories: [
              subcategory(1),
              fixtures.subcategory({
                id: "empty-subcategory",
                slug: "empty",
                name: "Empty",
                service_count: 0,
              }),
            ],
          }),
        ]}
      />,
    );

    expect(screen.queryByRole("link", { name: "Empty" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "See all Electrician subcategories" }),
    ).not.toBeInTheDocument();
  });
});
