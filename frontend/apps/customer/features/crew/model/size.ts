import type { RequirementQuestionView } from "@/features/requirement/adapters";

/**
 * The two preset answers that move the price, and the one place this app names them.
 *
 * ## Why these codes are written down at all
 *
 * Everything else on the crew form is rendered from whatever the catalogue
 * publishes, and `PresetQuestions` deliberately knows no question codes. This
 * file is the exception, and it is a narrow one: the rate preview is asked for a
 * price by `?headcount=&days=`, so the screen has to know *which* two answers
 * those parameters carry.
 *
 * The server's counterpart is `rate_cards.preset_size`, which reads the same two
 * codes off the stored draft. Its own docstring makes the point that a third
 * place to say "how many workers" is a third place for them to disagree — this
 * is the second, it exists because the query parameters are positional rather
 * than an answer map, and it is why the codes live in one named constant here
 * rather than inline at three call sites.
 *
 * If a variant does not publish these questions, `presetSize` returns `null` and
 * the rail simply does not price. That is the correct degradation: the server
 * would refuse such a draft anyway, and the screen says so rather than sending a
 * request it knows is unanswerable.
 */
export const HEADCOUNT_CODE = "worker_count";
export const DURATION_CODE = "duration_days";

/**
 * The floor for a counted answer when the catalogue publishes no rule.
 *
 * One. `quote_at_published_rate` refuses a zero headcount or a zero duration
 * outright, so a form that could reach either would be offering a state whose
 * only outcome is a refusal.
 */
export const NUMBER_FLOOR = 1;

export interface PresetSize {
  headcount: number;
  days: number;
}

/**
 * The size currently on the form, or `null` if it is not a priceable one.
 *
 * Null rather than a guess in three cases that look different and behave the
 * same: an answer that is missing, one that is not a number, and one that is
 * zero or negative. All three mean "there is nothing to price yet", and the
 * screen's job in each is to show the rate card without a total — never a zero,
 * which reads as free.
 */
export function presetSize(answers: Readonly<Record<string, unknown>>): PresetSize | null {
  const headcount = answers[HEADCOUNT_CODE];
  const days = answers[DURATION_CODE];
  if (typeof headcount !== "number" || typeof days !== "number") return null;
  if (!Number.isInteger(headcount) || !Number.isInteger(days)) return null;
  if (headcount < 1 || days < 1) return null;
  return { headcount, days };
}

/**
 * Starting answers for the counted questions, so the form opens showing a size.
 *
 * A stepper has to render *some* number, and rendering one the answer map does
 * not contain is how a form shows "1 person" while its own completeness check
 * says the question is unanswered — the button stays disabled and nothing on
 * screen explains why. So the displayed value and the stored answer start out as
 * the same thing.
 *
 * Only `number` questions are seeded. A choice or a boolean has no neutral
 * default: pre-selecting one would be the form answering a question on the
 * Customer's behalf and then charging them for it.
 */
export function initialAnswers(
  questions: readonly RequirementQuestionView[],
): Record<string, unknown> {
  const seeded: Record<string, unknown> = {};
  for (const question of questions) {
    if (question.kind === "number") {
      seeded[question.code] = question.minimum ?? NUMBER_FLOOR;
    }
  }
  return seeded;
}
