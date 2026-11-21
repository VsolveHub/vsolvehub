import { useState } from "react";
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

test("retaining focus when typing into an input inside controlled drawer", () => {
  function TestHost() {
    const [pin, setPin] = useState("");
    return (
      <Drawer
        open={true}
        onOpenChange={() => {}}
        title="Details"
        trigger={<span />}
      >
        <input
          data-testid="pin-input"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
      </Drawer>
    );
  }

  render(<TestHost />);
  const input = screen.getByTestId("pin-input");
  input.focus();
  expect(document.activeElement).toBe(input);

  // Type characters one by one
  fireEvent.change(input, { target: { value: "5" } });
  expect(document.activeElement).toBe(input);

  fireEvent.change(input, { target: { value: "50" } });
  expect(document.activeElement).toBe(input);

  fireEvent.change(input, { target: { value: "500" } });
  expect(document.activeElement).toBe(input);
});
