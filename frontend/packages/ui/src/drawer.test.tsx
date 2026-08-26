import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test } from "vitest";

import { Drawer } from "./drawer";

test("renders drawer content when triggered", () => {
  render(
    <Drawer title="Filters" trigger={<button>Open Drawer</button>}>
      <div>Drawer Content</div>
    </Drawer>
  );
  
  expect(screen.queryByText("Drawer Content")).not.toBeInTheDocument();
  
  fireEvent.click(screen.getByRole("button", { name: "Open Drawer" }));
  
  expect(screen.getByText("Drawer Content")).toBeInTheDocument();
  expect(screen.getByText("Filters")).toBeInTheDocument();
});
