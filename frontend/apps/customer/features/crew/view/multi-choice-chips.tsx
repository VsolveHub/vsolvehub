"use client";

import { cn } from "@vsolve/ui";

import type { RequirementQuestionView } from "@/features/requirement/adapters";

interface MultiChoiceChipsProps {
  question: RequirementQuestionView;
  value: unknown;
  onAnswer: (value: string[]) => void;
  disabled?: boolean;
}

/** A catalogue MULTIPLE_CHOICE answer as native checkboxes with chip presentation. */
export function MultiChoiceChips({
  question,
  value,
  onAnswer,
  disabled = false,
}: MultiChoiceChipsProps) {
  const selected = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

  return (
    <div role="group" aria-label={question.label} className="flex flex-wrap gap-2">
      {(question.options ?? []).map((option) => {
        const checked = selected.includes(option.value);
        return (
          <label
            key={option.value}
            className={cn(
              "relative flex min-h-11 cursor-pointer items-center rounded-control border px-4 py-2 text-sm",
              "transition-colors duration-fast has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
              "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
              "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
              checked
                ? "border-selected bg-selected-surface font-semibold text-text"
                : "border-line-strong bg-surface font-medium text-text-secondary hover:bg-surface-hover hover:text-text",
            )}
          >
            <input
              type="checkbox"
              name={question.code}
              value={option.value}
              checked={checked}
              disabled={disabled}
              onChange={() =>
                onAnswer(
                  checked
                    ? selected.filter((entry) => entry !== option.value)
                    : [...selected, option.value],
                )
              }
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
