import Image from "next/image";

type Party = { name: string; image?: string } | null | undefined;

/**
 * Avatar for a booking party (partner / crew lead). Uses their real photo when
 * one exists; otherwise a deterministic initials chip — never a stock face.
 * Partners currently have no photo column, so this renders initials in practice,
 * but it upgrades automatically once real photos land.
 */
export function PartyAvatar({
  party,
  size = 40,
  className = "",
}: {
  party: Party;
  size?: number;
  className?: string;
}) {
  const name = party?.name?.trim() ?? "";
  const initial = name.charAt(0).toUpperCase() || "?";

  if (party?.image) {
    return (
      <Image
        src={party.image}
        alt={name || "Provider"}
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-light)] font-black text-[var(--color-brand)] ${className}`}
    >
      {initial}
    </span>
  );
}
