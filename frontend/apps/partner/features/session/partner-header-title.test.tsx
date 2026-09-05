import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PartnerHeaderTitle, PartnerHeaderTitleProvider } from "./partner-header-title";

describe("PartnerHeaderTitle", () => {
  it("replaces the generic focused-route title with the loaded project name", async () => {
    render(
      <PartnerHeaderTitleProvider>
        {(title) => (
          <>
            <h1>{title ?? "Enquiry"}</h1>
            <PartnerHeaderTitle title="  Event lighting & decor  " />
          </>
        )}
      </PartnerHeaderTitleProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Event lighting & decor" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Enquiry" })).not.toBeInTheDocument();
  });

  it("restores the route title when the project-owning screen unmounts", async () => {
    function App({ showProject }: { readonly showProject: boolean }) {
      return (
        <PartnerHeaderTitleProvider>
          {(title) => (
            <>
              <h1>{title ?? "Enquiry"}</h1>
              {showProject ? <PartnerHeaderTitle title="Wedding lighting" /> : null}
            </>
          )}
        </PartnerHeaderTitleProvider>
      );
    }

    const view = render(<App showProject />);
    expect(await screen.findByRole("heading", { name: "Wedding lighting" })).toBeInTheDocument();

    view.rerender(<App showProject={false} />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Enquiry" })).toBeInTheDocument();
    });
  });
});
