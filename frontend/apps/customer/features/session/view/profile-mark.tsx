import { cn } from "@vsolve/ui";

export interface ProfileIdentity {
  displayName: string | null;
  fullName: string | null;
}

export function profileName(identity: ProfileIdentity): string | null {
  return identity.displayName?.trim() || identity.fullName?.trim() || null;
}

export function profileInitials(identity: ProfileIdentity): string | null {
  const name = profileName(identity);
  if (name === null) return null;

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProfileMark({
  identity,
  className,
}: {
  identity: ProfileIdentity;
  className?: string;
}) {
  const initials = profileInitials(identity);

  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-selected-surface font-extrabold text-info-text ring-1 ring-action-line",
        className,
      )}
    >
      {initials ?? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-1/2"
        >
          <circle cx="12" cy="8.5" r="3.6" />
          <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
        </svg>
      )}
    </span>
  );
}
