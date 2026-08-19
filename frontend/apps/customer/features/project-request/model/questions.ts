import type { RequirementQuestionView } from "@/features/requirement/adapters";

/**
 * How the brief's first screen decides which control a question gets.
 *
 * Almost all of it is read off the data — a choice with three short labels is a
 * segmented control, a longer list is chips, a number is a stepper-free card.
 * The catalogue owns its vocabulary and this owns none of it.
 *
 * ## The one exception, and why it is written down
 *
 * A number needs a **unit**, and the wire publishes none. "1,250" beside a label
 * reading "Roughly how big?" is ambiguous in a way that matters: square feet and
 * square metres differ by a factor of ten, and a vendor quoting against the wrong
 * one is a wasted site visit.
 *
 * So one question code is named here, with its unit, exactly as
 * `features/crew/model/size.ts` names the two A3 codes and for the same reason.
 * A number question this map does not know renders without a unit rather than
 * borrowing one — an unlabelled number is merely unhelpful, where a wrongly
 * labelled one is wrong.
 */
export const QUESTION_UNITS: Readonly<Record<string, string>> = {
  floor_area_sqft: "sq ft",
};

export function unitFor(question: RequirementQuestionView): string | undefined {
  return QUESTION_UNITS[question.code];
}

/**
 * Whether a choice question suits a joined segmented track.
 *
 * Three or fewer options with short labels: they read as one question about a
 * single scale — home / office / shop — and a segmented control says that where
 * separate pills say "here are some unrelated tags". Anything longer wraps,
 * which a segmented control cannot do, so it goes on chips.
 */
export function fitsOnSegments(question: RequirementQuestionView): boolean {
  const options = question.options ?? [];
  if (options.length === 0 || options.length > 3) return false;
  return options.every((option) => option.label.length <= 12);
}

/** Chips take everything else that is a choice, up to a list worth scanning. */
export function fitsOnChips(question: RequirementQuestionView): boolean {
  const options = question.options ?? [];
  return options.length > 0 && options.length <= 8;
}
