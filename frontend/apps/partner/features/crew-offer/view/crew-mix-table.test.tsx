import { render, screen, within } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import { CrewMixTable } from "./crew-mix-table";

function line(
  role_code: string,
  role_label: string,
  men: number,
  women: number,
): Schemas["CrewMixLine"] {
  return { role_code, role_label, men, women, total: men + women };
}

const WEDDING: readonly Schemas["CrewMixLine"][] = [
  line("waiter_count", "Waiters and serving staff", 3, 2),
  line("setup_count", "Setup and teardown crew", 2, 0),
];

describe("the crew mix a lead checks before accepting", () => {
  it("shows every role as a row, with the totals in the heading", () => {
    render(<CrewMixTable lines={WEDDING} />);

    const waiters = screen.getByRole("row", { name: /Waiters and serving staff/ });
    expect(within(waiters).getByText("3")).toBeInTheDocument();
    expect(within(waiters).getByText("2")).toBeInTheDocument();

    // 3 + 2 waiters and 2 + 0 setup crew.
    expect(screen.getByText("5 men · 2 women")).toBeInTheDocument();
  });

  /**
   * A zero is a fact a lead plans around -- "no women on setup" is the difference between a job
   * they can take and one they cannot. A blank cell would read as missing data instead.
   */
  it("renders a zero rather than leaving the cell blank", () => {
    render(<CrewMixTable lines={WEDDING} />);

    const setup = screen.getByRole("row", { name: /Setup and teardown crew/ });
    expect(within(setup).getByText("0")).toBeInTheDocument();
  });

  it("says nothing at all for a service that asks for no split", () => {
    const { container } = render(<CrewMixTable lines={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("carries the roster footnote the offer screen passes it", () => {
    render(<CrewMixTable lines={WEDDING} footnote="Your verified crew list has 4 people." />);

    expect(screen.getByText(/Your verified crew list has 4 people/)).toBeInTheDocument();
  });

  it("uses singulars where the count earns them", () => {
    render(<CrewMixTable lines={[line("hostess_count", "Guest reception", 1, 1)]} />);

    expect(screen.getByText("1 man · 1 woman")).toBeInTheDocument();
  });
});
