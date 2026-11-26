import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../queries", () => ({ usePartnerDirectory: vi.fn() }));

import { usePartnerDirectory } from "../queries";
import { PartnerPicker, type PickedPartner } from "./partner-picker";

const RAVI = {
  id: "p-1",
  display_name: "Ravi Kumar",
  phone_number: "+919800000001",
  skills: [{ code: "plumbing", name: "Plumbing" }],
};
const SITA = {
  id: "p-2",
  display_name: "Sita Rao",
  phone_number: "+919800000002",
  skills: [],
};

function withPartners(rows: unknown[], state: Record<string, unknown> = {}) {
  vi.mocked(usePartnerDirectory).mockReturnValue({
    data: { pages: [{ results: rows, next: null, previous: null }] },
    isLoading: false,
    isError: false,
    ...state,
  } as never);
}

function Harness({ onPick }: { onPick: (partner: PickedPartner | null) => void }) {
  const [value, setValue] = useState<PickedPartner | null>(null);
  return (
    <PartnerPicker
      value={value}
      onChange={(next) => {
        setValue(next);
        onPick(next);
      }}
    />
  );
}

describe("PartnerPicker", () => {
  beforeEach(() => {
    withPartners([RAVI, SITA]);
  });

  it("suggests partners as soon as the box is focused, before anything is typed", () => {
    render(<Harness onPick={vi.fn()} />);

    fireEvent.focus(screen.getByRole("combobox"));

    const list = screen.getByRole("listbox", { name: "Suggested partners" });
    expect(list).toHaveTextContent("Ravi Kumar");
    expect(list).toHaveTextContent("Sita Rao");
    expect(list).toHaveTextContent("Plumbing");
  });

  it("picks a suggestion with one click", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);

    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.mouseDown(screen.getByRole("option", { name: /Sita Rao/ }));

    expect(onPick).toHaveBeenCalledWith({
      id: "p-2",
      display_name: "Sita Rao",
      phone_number: "+919800000002",
    });
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
  });

  it("moves with the arrow keys and picks with Enter", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    const box = screen.getByRole("combobox");

    fireEvent.focus(box);
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Sita Rao/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.keyDown(box, { key: "Enter" });

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "p-2" }));
  });

  it("closes on Escape", () => {
    render(<Harness onPick={vi.fn()} />);
    const box = screen.getByRole("combobox");

    fireEvent.focus(box);
    fireEvent.keyDown(box, { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("says what to try when nothing matches", async () => {
    withPartners([]);
    render(<Harness onPick={vi.fn()} />);
    const box = screen.getByRole("combobox");

    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "zzz" } });

    expect(await screen.findByText(/No approved partner matches “zzz”/)).toBeInTheDocument();
  });

  it("says so when partners cannot be loaded", () => {
    withPartners([], { isError: true });
    render(<Harness onPick={vi.fn()} />);

    fireEvent.focus(screen.getByRole("combobox"));

    expect(screen.getByText(/could not be loaded/)).toBeInTheDocument();
  });
});
