import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { BookingsSearchField } from "./bookings-search-field";

function SearchHarness() {
  const [value, setValue] = useState("");
  return (
    <div>
      <BookingsSearchField value={value} onChange={setValue} />
      <p>Query: {value || "(empty)"}</p>
    </div>
  );
}

describe("BookingsSearchField", () => {
  it("has an accessible name and the production placeholder", () => {
    render(<BookingsSearchField value="" onChange={() => undefined} />);

    expect(screen.getByRole("searchbox", { name: /search bookings/i })).toHaveAttribute(
      "placeholder",
      "Search by service name, booking ID or keyword…",
    );
  });

  it("clears the query without a page reload", () => {
    render(<SearchHarness />);
    const input = screen.getByRole("searchbox", { name: /search bookings/i });

    fireEvent.change(input, { target: { value: "Grooming" } });
    expect(screen.getByText("Query: Grooming")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
    expect(screen.getByText("Query: (empty)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear search/i })).not.toBeInTheDocument();
  });
});
