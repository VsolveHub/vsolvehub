import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { Toolbar } from "./toolbar";

test("renders search and controls", () => {
  render(
    <Toolbar
      search={<input placeholder="Search cases" />}
      controls={<button>Export</button>}
    />
  );
  expect(screen.getByPlaceholderText("Search cases")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
});

test("renders active filters and clear button", () => {
  const onRemove = vi.fn();
  const onClear = vi.fn();
  
  render(
    <Toolbar
      activeFilters={[
        { id: "status", label: "Status", value: "Open" },
        { id: "kind", label: "Kind", value: "Damage" }
      ]}
      onRemoveFilter={onRemove}
      onClearFilters={onClear}
    />
  );
  
  expect(screen.getByText("Status:")).toBeInTheDocument();
  expect(screen.getByText("Open")).toBeInTheDocument();
  expect(screen.getByText("Kind:")).toBeInTheDocument();
  expect(screen.getByText("Damage")).toBeInTheDocument();
  
  fireEvent.click(screen.getByRole("button", { name: "Remove filter Status" }));
  expect(onRemove).toHaveBeenCalledWith("status");
  
  fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
  expect(onClear).toHaveBeenCalled();
});
