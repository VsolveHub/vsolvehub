"use client";

import { useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { applySkillSuggestion, skillSuggestions } from "../model";
import { fetchJobOptions, type JobOptions } from "../queries";

/**
 * The comma-separated skills field, offering skills as the seeker types: this job's own skills
 * first, then skills from the job-role catalogue.
 */
export function SkillsInput({
  id,
  value,
  jobSkills = [],
  onChange,
}: {
  id?: string;
  value: string;
  jobSkills?: readonly string[];
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const options = useQuery({ queryKey: ["job-options"], queryFn: fetchJobOptions, staleTime: 3600_000 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const pool = useMemo(() => {
    const opts = options.data as JobOptions | undefined;
    const catalogue = (opts?.categories ?? []).flatMap((c) => c.roles.flatMap((r) => r.skills ?? []));
    return [...jobSkills, ...catalogue];
  }, [jobSkills, options.data]);

  const typed = value.split(",").pop()?.trim() ?? "";
  // With nothing typed yet, offer only this job's skills; the whole catalogue would be noise.
  const suggestions = skillSuggestions(value, typed ? pool : jobSkills);
  const showList = open && suggestions.length > 0;

  const pick = (skill: string) => {
    onChange(applySkillSuggestion(value, skill));
    setActive(-1);
  };

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className="mt-1 h-10 w-full rounded-control border border-line px-3 text-sm"
        placeholder="e.g. Python, React, Customer support"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (!showList) {
            if (e.key === "ArrowDown") setOpen(true);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            const skill = suggestions[active];
            if (skill) pick(skill);
          }
        }}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggested skills"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-control border border-line bg-surface py-1 shadow-raised"
        >
          {suggestions.map((skill, i) => (
            <li
              key={skill}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: picking must happen before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(skill);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 text-sm font-normal ${i === active ? "bg-surface-hover" : ""}`}
            >
              {skill}
              {jobSkills.some((s) => s.toLowerCase() === skill.toLowerCase()) ? (
                <span className="ml-2 text-xs text-text-secondary">This job</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
