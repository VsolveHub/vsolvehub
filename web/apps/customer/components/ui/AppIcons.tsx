import { FlaticonIcon } from "./FlaticonIcon";

type IconProps = { size?: number; className?: string; active?: boolean };

export function SearchIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <FlaticonIcon name="search-alt" size={20} className={className} />;
}

export function ChevronRightIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <FlaticonIcon name="angle-right" size={16} className={className} />;
}

export function MenuIcon({ size = 22 }: IconProps) {
  return <FlaticonIcon name="menu-burger" size={size} />;
}

export function BellIcon({ size = 20 }: IconProps) {
  return <FlaticonIcon name="bell" size={size} />;
}

export function WalletIcon({ size = 16 }: IconProps) {
  return <FlaticonIcon name="wallet" size={size} />;
}

export function PinIcon({ size = 16 }: IconProps) {
  return <FlaticonIcon name="map-marker" size={size} />;
}

export function ChevronDownIcon({ size = 14 }: IconProps) {
  return <FlaticonIcon name="angle-down" size={size} />;
}

export function HeaderSearchIcon({ size = 18 }: IconProps) {
  return <FlaticonIcon name="search-alt" size={size} />;
}

export function HomeIcon({ active, size = 22 }: IconProps) {
  return (
    <FlaticonIcon
      name="home"
      size={size}
      color={active ? "var(--color-brand)" : "currentColor"}
    />
  );
}

export function BookingsIcon({ active, size = 22 }: IconProps) {
  return (
    <FlaticonIcon
      name="clipboard-list"
      size={size}
      color={active ? "var(--color-brand)" : "currentColor"}
    />
  );
}

export function PlusIcon({ size = 28 }: IconProps) {
  return <FlaticonIcon name="plus" size={size} color="#ffffff" />;
}

export function MessagesIcon({ active, size = 22 }: IconProps) {
  return (
    <FlaticonIcon
      name="comment-alt"
      size={size}
      color={active ? "var(--color-brand)" : "currentColor"}
    />
  );
}

export function ProfileIcon({ active, size = 22 }: IconProps) {
  return (
    <FlaticonIcon
      name="user"
      size={size}
      color={active ? "var(--color-brand)" : "currentColor"}
    />
  );
}
