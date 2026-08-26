import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { PageHeader } from "./page-header";

test("renders title and description", () => {
  render(<PageHeader title="Home" description="Welcome to the dashboard" />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Home");
  expect(screen.getByText("Welcome to the dashboard")).toBeInTheDocument();
});

test("renders actions and breadcrumbs when provided", () => {
  render(
    <PageHeader
      title="Cases"
      breadcrumbs={<span>Operations / Cases</span>}
      actions={<button>Create Case</button>}
    />
  );
  expect(screen.getByText("Operations / Cases")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create Case" })).toBeInTheDocument();
});
