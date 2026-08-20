/** Brings the one required review choice to both pointer and keyboard users. */
export function guideToVisitPlanSelection(): void {
  const chooser = document.querySelector<HTMLElement>("[data-visit-plan-chooser]");
  if (chooser === null) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  chooser.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "center",
  });
  chooser.querySelector<HTMLElement>('[role="radio"], input[type="radio"], button')?.focus({
    preventScroll: true,
  });
}
