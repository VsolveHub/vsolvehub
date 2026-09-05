import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FactTile } from "./fact-tile";

describe("FactTile", () => {
  it("renders label, value, and icon correctly", () => {
    render(
      <FactTile
        icon={<span data-testid="icon">📍</span>}
        label="Area"
        value="Palakurthi, Telangana"
      />,
    );

    expect(screen.getByText("Area")).toBeInTheDocument();
    expect(screen.getByText("Palakurthi, Telangana")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("renders as an interactive button when onClick is provided and triggers handler", () => {
    const handleClick = vi.fn();
    render(
      <FactTile
        icon={<span>📍</span>}
        label="Area"
        value="Palakurthi"
        onClick={handleClick}
      />,
    );

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
