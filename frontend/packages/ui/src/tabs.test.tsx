import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { Tabs } from "./tabs";

test("renders state-based tabs and calls onChange", () => {
  const onChange = vi.fn();
  
  render(
    <Tabs
      items={[
        { label: "Active", value: "active" },
        { label: "Resolved", value: "resolved" },
      ]}
      value="active"
      onChange={onChange}
    />
  );
  
  expect(screen.getByText("Active")).toBeInTheDocument();
  expect(screen.getByText("Resolved")).toBeInTheDocument();
  
  fireEvent.click(screen.getByRole("tab", { name: "Resolved" }));
  expect(onChange).toHaveBeenCalledWith("resolved");
});

test("renders route-based tabs", () => {
  render(
    <Tabs
      routeBased
      items={[
        { label: "Overview", href: "/cases/123" },
        { label: "History", href: "/cases/123/history" },
      ]}
    />
  );
  
  expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/cases/123");
  expect(screen.getByRole("link", { name: "History" })).toHaveAttribute("href", "/cases/123/history");
});
