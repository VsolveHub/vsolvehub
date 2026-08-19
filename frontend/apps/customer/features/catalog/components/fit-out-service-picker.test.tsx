import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FitOutServicePicker } from "./fit-out-service-picker";

describe("FitOutServicePicker", () => {
  it("shows the fit-out services as quick choices", () => {
    render(<FitOutServicePicker serviceSlug="interior-fit-out-project" />);

    expect(screen.getByRole("button", { name: /office fit-out/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retail fit-out/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hospitality fit-out/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /shell and core completion/i })).toBeInTheDocument();
  });

  it("opens details and carries the chosen service into the request flow", () => {
    render(<FitOutServicePicker serviceSlug="interior-fit-out-project" />);

    fireEvent.click(screen.getByRole("button", { name: /retail fit-out/i }));

    expect(screen.getByRole("dialog", { name: /retail fit-out/i })).toBeInTheDocument();
    expect(screen.getByText("What is included")).toBeInTheDocument();
    expect(screen.getByText("Display wall carpentry")).toBeInTheDocument();
    expect(screen.getByText("What is not included")).toBeInTheDocument();
    expect(screen.getByText("POS machines")).toBeInTheDocument();
    expect(screen.getByText("Can this include a shopfront?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue with this service/i })).toHaveAttribute(
      "href",
      "/requests/new/interior-fit-out-project?selected_service=retail-fit-out",
    );
  });
});
