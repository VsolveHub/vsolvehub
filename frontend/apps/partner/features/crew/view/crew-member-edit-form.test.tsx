import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CrewRow } from "../adapters/roster";
import { CrewMemberEditForm } from "./crew-member-edit-form";

/**
 * Editing one person on a roster, and which of their details this agency owns.
 *
 * The test this file exists for is the name. It used to be read-only, for a real reason — the
 * global crew record is shared by every agency that resolved to the same number — and the escape
 * hatch the screen offered could not work: re-adding resolves by a hash of the number and returns
 * the same wrong name, so a typo was permanent. It is now a per-roster label, and the assertion
 * that matters is that it reaches `onSubmit` as `display_name`.
 *
 * The number stays read-only, and that is not the same gap: it *is* the identity.
 */
const ROW: CrewRow = {
  membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Asha Rao",
  phoneMasked: "•••••• 1001",
  isSupervisor: false,
  skillCodes: ["usher"],
  documentsVerified: false,
  isArchived: false,
  gender: "",
  documents: [],
};

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe("CrewMemberEditForm", () => {
  it("edits the roster label, the skills, the supervisor flag and a blank gender", () => {
    const onSubmit = vi.fn();
    render(
      <CrewMemberEditForm
        row={ROW}
        open
        onOpenChange={() => undefined}
        onSubmit={onSubmit}
        skillOptions={[
          { code: "usher", label: "Usher" },
          { code: "server", label: "Food service" },
        ]}
      />,
      { wrapper },
    );

    fireEvent.change(screen.getByRole("textbox", { name: /name/i }), {
      target: { value: "Asha Rao Kumari" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /food service/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /report attendance/i }));
    fireEvent.change(screen.getByLabelText(/man or woman/i), { target: { value: "WOMAN" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(onSubmit).toHaveBeenCalledWith(ROW.membershipId, {
      display_name: "Asha Rao Kumari",
      skill_codes: ["usher", "server"],
      is_supervisor: true,
      gender: "WOMAN",
    });
  });

  it("will not submit a blank name", () => {
    const onSubmit = vi.fn();
    render(
      <CrewMemberEditForm row={ROW} open onOpenChange={() => undefined} onSubmit={onSubmit} />,
      { wrapper },
    );

    fireEvent.change(screen.getByRole("textbox", { name: /name/i }), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps the mobile number read-only, because it is the identity", () => {
    render(
      <CrewMemberEditForm row={ROW} open onOpenChange={() => undefined} onSubmit={() => undefined} />,
      { wrapper },
    );

    expect(screen.getByText("•••••• 1001")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /mobile/i })).not.toBeInTheDocument();
  });

  it("lets a recorded gender be corrected, and leaves the refusal to the server", () => {
    /* The lock this replaces fired whenever a value existed, including for a worker nobody else
       had — where it protected no one and left the record permanently wrong. The screen cannot
       know which case it is in without the server disclosing that a second agency holds this
       person, so it offers the field and renders `m2_crew_gender_conflict` if it comes back. */
    const onSubmit = vi.fn();
    render(
      <CrewMemberEditForm
        row={{ ...ROW, gender: "MAN" }}
        open
        onOpenChange={() => undefined}
        onSubmit={onSubmit}
      />,
      { wrapper },
    );

    const select = screen.getByLabelText(/man or woman/i);
    expect(select).not.toBeDisabled();

    fireEvent.change(select, { target: { value: "WOMAN" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      ROW.membershipId,
      expect.objectContaining({ gender: "WOMAN" }),
    );
  });

  it("shows the cross-agency refusal when the server sends one", () => {
    render(
      <CrewMemberEditForm
        row={{ ...ROW, gender: "MAN" }}
        open
        onOpenChange={() => undefined}
        onSubmit={() => undefined}
        submitError="Vsolve already has Ramesh recorded as man, from another agency's crew list."
      />,
      { wrapper },
    );

    expect(screen.getByText(/from another agency's crew list/i)).toBeInTheDocument();
  });

  it("offers a required government ID and marks unchecked documents as such", () => {
    render(
      <CrewMemberEditForm row={ROW} open onOpenChange={() => undefined} onSubmit={() => undefined} />,
      { wrapper },
    );

    expect(screen.getByText(/government id/i)).toBeInTheDocument();
    expect(screen.getByText(/not checked yet/i)).toBeInTheDocument();
  });
});
