import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CustomerProfile } from "../queries";
import { PersonalDetailsForm } from "./personal-details-form";

const profile: CustomerProfile = {
  id: "f26419bd-c768-4ddb-bff3-4cc405fdbf52",
  phone_number: "+919876543210",
  display_name: "Gopal",
  full_name: "Gopal Rao",
  email: "gopal@example.test",
  date_joined: "2026-08-19T12:00:00Z",
  roles: ["customer"],
};

describe("PersonalDetailsForm", () => {
  it("explains which name reaches receipts and preserves the sign-in number", () => {
    render(<PersonalDetailsForm profile={profile} onSave={vi.fn()} isSaving={false} error={null} />);

    expect(screen.getByLabelText(/full name/i)).toHaveValue("Gopal Rao");
    expect(screen.getByText(/printed on bookings and receipts/i)).toBeInTheDocument();
    expect(screen.getByText(/\+919876543210 remains your verified sign-in number/i)).toBeInTheDocument();
  });

  it("normalizes names and submits only customer-owned fields", () => {
    const onSave = vi.fn();
    render(<PersonalDetailsForm profile={profile} onSave={onSave} isSaving={false} error={null} />);

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "  Gopal   Krishna Rao  " },
    });
    fireEvent.change(screen.getByLabelText(/preferred name/i), {
      target: { value: "  Gopal  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    expect(onSave).toHaveBeenCalledWith({
      full_name: "Gopal Krishna Rao",
      display_name: "Gopal",
      email: "gopal@example.test",
    });
  });

  it("keeps save local until a receipt name is present", () => {
    const onSave = vi.fn();
    render(<PersonalDetailsForm profile={profile} onSave={onSave} isSaving={false} error={null} />);

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/name you want printed/i);
    expect(onSave).not.toHaveBeenCalled();
  });
});
