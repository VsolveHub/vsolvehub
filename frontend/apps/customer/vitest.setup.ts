import "@testing-library/jest-dom/vitest";

/**
 * jsdom ships `<dialog>` but not its modal methods.
 *
 * `showModal` and `close` are still unimplemented, so any component built on the
 * native element throws on mount and cannot be tested at all. The alternative —
 * rebuilding the dialog on divs and `aria-modal` — would trade real focus
 * trapping, real Escape handling and the real top layer for testability, which
 * is the wrong way round.
 *
 * This is the smallest stand-in that keeps behaviour observable: `open` tracks
 * state so `getByRole("dialog")` resolves, and closing fires the `close` event
 * the component listens for. It deliberately does not emulate the top layer or
 * focus trapping — those belong to the Playwright suite, in a browser that
 * actually has them.
 */
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(
    this: HTMLDialogElement,
    returnValue?: string,
  ) {
    this.open = false;
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new Event("close"));
  };
}
