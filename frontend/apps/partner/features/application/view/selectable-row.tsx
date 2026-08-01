"use client";

/**
 * One checkable option.
 *
 * A real `<input type="checkbox">` inside a `<label>` rather than a styled div
 * with a click handler: that is what gives keyboard operation, the checked state
 * in the accessibility tree, and the whole row as a touch target for free. The
 * visual selection is a border and a tint *in addition to* the checkbox, never
 * instead of it — state is never carried by colour alone.
 */
export function SelectableRow({
  checked,
  disabled,
  onChange,
  label,
  caption,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  label: string;
  caption?: string;
}) {
  return (
    <label
      className={[
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-control border p-3",
        checked ? "border-action bg-selected-surface" : "border-line bg-surface",
        disabled ? "cursor-not-allowed opacity-60" : "hover:border-warm-600",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-action)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text">{label}</span>
        {caption ? <span className="block text-sm text-text-secondary">{caption}</span> : null}
      </span>
    </label>
  );
}
