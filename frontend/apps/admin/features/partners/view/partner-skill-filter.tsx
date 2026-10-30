"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button, Field, Input, Spinner, useMediaQuery } from "@vsolve/ui";

export interface PartnerSkillOption {
  code: string;
  name: string;
}

interface PartnerSkillFilterProps {
  skills: readonly PartnerSkillOption[];
  selected: readonly string[];
  onChange: (codes: string[]) => void;
  isPending: boolean;
  isError: boolean;
}

/**
 * Searchable multi-select for the Partner directory skill filter.
 *
 * Picking more than one skill is a union ("any of these"), which is how a
 * manager reads it — the intersection reading belongs to dispatch.
 *
 * On desktop this is a popover; on mobile the Toolbar already collapses filters
 * into a Drawer, so the checkbox list renders inline there rather than nesting
 * a popover inside it.
 */
export function PartnerSkillFilter({
  skills,
  selected,
  onChange,
  isPending,
  isError,
}: PartnerSkillFilterProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)");

  if (isError) {
    return (
      <p className="max-w-xs text-sm text-text-secondary">
        The skill list could not be loaded, so no skill filter is offered rather than a
        partial one.
      </p>
    );
  }

  if (isPending) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <Spinner size="sm" />
        Loading skills…
      </div>
    );
  }

  if (skills.length === 0) {
    return <p className="text-sm text-text-secondary">No skills are configured yet.</p>;
  }

  if (!isDesktop) {
    return (
      <SkillFilterPanel
        skills={skills}
        selected={selected}
        onChange={onChange}
        listId="partner-skills-mobile"
      />
    );
  }

  return (
    <SkillFilterPopover skills={skills} selected={selected} onChange={onChange} />
  );
}

interface SkillFilterPanelProps {
  skills: readonly PartnerSkillOption[];
  selected: readonly string[];
  onChange: (codes: string[]) => void;
  listId: string;
  onClose?: () => void;
}

function SkillFilterPanel({ skills, selected, onChange, listId, onClose }: SkillFilterPanelProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return skills;
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(needle) || skill.code.toLowerCase().includes(needle),
    );
  }, [query, skills]);

  const clampedActiveIndex = Math.min(activeIndex, Math.max(filtered.length - 1, 0));

  const toggle = useCallback(
    (code: string) => {
      onChange(
        selected.includes(code) ? selected.filter((entry) => entry !== code) : [...selected, code],
      );
    },
    [onChange, selected],
  );

  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (filtered.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      const skill = filtered[clampedActiveIndex];
      if (skill) toggle(skill.code);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose?.();
    }
  };

  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${clampedActiveIndex}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [clampedActiveIndex]);

  return (
    <div className="flex w-full min-w-[16rem] flex-col gap-2">
      <Field label="Search skills" description="Partners with any selected skill are shown." showOptional={false}>
        <Input
          value={query}
          placeholder="Type to filter…"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && filtered.length > 0) {
              event.preventDefault();
              listRef.current?.focus();
            }
          }}
        />
      </Field>

      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Skills — match any selected"
        aria-multiselectable="true"
        tabIndex={0}
        onKeyDown={onListKeyDown}
        className="max-h-80 overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-1"
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-sm text-text-secondary">No skills match that filter.</p>
        ) : (
          filtered.map((skill, index) => {
            const checked = selected.includes(skill.code);
            return (
              <label
                key={skill.code}
                data-index={index}
                role="option"
                aria-selected={checked}
                className={
                  index === clampedActiveIndex
                    ? "flex cursor-pointer items-center gap-2 rounded-control bg-surface-hover px-3 py-2 text-sm text-text"
                    : "flex cursor-pointer items-center gap-2 rounded-control px-3 py-2 text-sm text-text hover:bg-surface-hover"
                }
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(skill.code)}
                  className="size-4 shrink-0"
                />
                <span>{skill.name}</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

function SkillFilterPopover({
  skills,
  selected,
  onChange,
}: {
  skills: readonly PartnerSkillOption[];
  selected: readonly string[];
  onChange: (codes: string[]) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const label =
    selected.length === 0
      ? "Any skill"
      : `${selected.length} skill${selected.length === 1 ? "" : "s"} selected`;

  return (
    <div ref={rootRef} className="relative">
      <div ref={triggerWrapRef}>
        <Button
          type="button"
          variant="outline"
          size="md"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-2 font-normal"
        >
          {label}
          <ChevronDown className="h-4 w-4 text-text-secondary" aria-hidden />
        </Button>
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-card border border-line bg-surface p-3 shadow-card">
          <SkillFilterPanel
            skills={skills}
            selected={selected}
            onChange={onChange}
            listId={listId}
            onClose={() => {
              setOpen(false);
              triggerWrapRef.current?.querySelector("button")?.focus();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
