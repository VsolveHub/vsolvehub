import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

type IconProps = { size?: number; className?: string };

function ProfileMenuIcon({ name, size = 22, className }: IconProps & { name: string }) {
  return <FlaticonIcon name={name} size={size} className={className} />;
}

export function ClipboardIcon() {
  return <ProfileMenuIcon name="clipboard-list" />;
}

export function DeviceIcon() {
  return <ProfileMenuIcon name="mobile-notch" />;
}

export function HeadsetIcon() {
  return <ProfileMenuIcon name="headset" />;
}

export function ReceiptIcon() {
  return <ProfileMenuIcon name="receipt" />;
}

export function WalletMenuIcon() {
  return <ProfileMenuIcon name="wallet" />;
}

export function PlusCircleIcon() {
  return <ProfileMenuIcon name="plus" />;
}

export function StarIcon() {
  return <ProfileMenuIcon name="circle-star" />;
}

export function PinIcon() {
  return <ProfileMenuIcon name="map-marker" />;
}

export function CardIcon() {
  return <ProfileMenuIcon name="credit-card" />;
}

export function SettingsIcon() {
  return <ProfileMenuIcon name="settings-sliders" />;
}

export function BrandIcon() {
  return (
    <span
      className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-brand)] text-base font-black text-white"
      aria-hidden
    >
      V
    </span>
  );
}
