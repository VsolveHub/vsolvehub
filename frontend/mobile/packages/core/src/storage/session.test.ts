import { sessionGet, sessionRemove, sessionSet } from "./session";

// The phone build of the web's `sessionStorage`. The web version threw on a phone (React Native
// has `window` but no `window.sessionStorage`), and its `catch` silently kept nothing.
describe("session store on a phone", () => {
  it("keeps a value for the rest of the app session", () => {
    sessionSet("vsolve.booking.ac-repair", '{"notes":"2 units"}');
    expect(sessionGet("vsolve.booking.ac-repair")).toBe('{"notes":"2 units"}');
  });

  it("returns null for a key never written", () => {
    expect(sessionGet("vsolve.booking.never-written")).toBeNull();
  });

  it("overwrites and removes", () => {
    sessionSet("vsolve.booking.plumber", "first");
    sessionSet("vsolve.booking.plumber", "second");
    expect(sessionGet("vsolve.booking.plumber")).toBe("second");

    sessionRemove("vsolve.booking.plumber");
    expect(sessionGet("vsolve.booking.plumber")).toBeNull();
  });
});
