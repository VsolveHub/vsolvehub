import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { SplitView } from "./split-view";

test("renders list pane and detail pane", () => {
  render(
    <SplitView
      listPane={<div>Master List</div>}
      detailPane={<div>Detail Content</div>}
      showDetailOnMobile={true}
      onBack={() => {}}
    />
  );
  expect(screen.getByText("Master List")).toBeInTheDocument();
  expect(screen.getByText("Detail Content")).toBeInTheDocument();
});

test("renders without detail content when detail pane is null", () => {
  render(
    <SplitView
      listPane={<div>Master List</div>}
      detailPane={null}
      showDetailOnMobile={false}
      onBack={() => {}}
    />
  );
  expect(screen.getByText("Master List")).toBeInTheDocument();
  expect(screen.queryByText("Detail Content")).not.toBeInTheDocument();
});

test("calls onBack when mobile back button is clicked", () => {
  const onBack = vi.fn();
  render(
    <SplitView
      listPane={<div>Master List</div>}
      detailPane={<div>Detail Content</div>}
      showDetailOnMobile={true}
      onBack={onBack}
    />
  );
  
  const backButton = screen.getByRole("button", { name: /Back to list/i });
  fireEvent.click(backButton);
  expect(onBack).toHaveBeenCalled();
});

test("stacks the panes until lg, where the Operations sidebar still leaves room for both", () => {
  // At sm the split clipped the detail pane beside the 15rem sidebar on a 768px tablet.
  const { container } = render(
    <SplitView
      listPane={<div>Master List</div>}
      detailPane={<div>Detail Content</div>}
      showDetailOnMobile={true}
      onBack={() => {}}
    />
  );
  const list = screen.getByText("Master List").closest("div.shrink-0");
  expect(list).toHaveClass("hidden", "lg:flex");
  expect(screen.getByRole("button").parentElement).toHaveClass("lg:hidden");
  expect(container.innerHTML).not.toMatch(/\bsm:/);
});
