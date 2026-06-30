import { FlaticonIcon } from "./FlaticonIcon";

type IconProps = { className?: string };

export function SearchIcon({ className = "h-5 w-5" }: IconProps) {
  return <FlaticonIcon name="search-alt" size={20} className={className} />;
}

export function ChevronRightIcon({ className = "h-4 w-4" }: IconProps) {
  return <FlaticonIcon name="angle-right" size={16} className={className} />;
}
