"use client";

import Link from "next/link";
import {
  BrandIcon,
  CardIcon,
  ClipboardIcon,
  DeviceIcon,
  HeadsetIcon,
  PinIcon,
  PlusCircleIcon,
  ReceiptIcon,
  SettingsIcon,
  StarIcon,
  WalletMenuIcon,
} from "./ProfileIcons";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import { useLogoutMutation } from "@/lib/query/hooks";
import { motion } from "framer-motion";

type QuickAction = { label: string; href: string };
type MenuItem = { label: string; href: string };

type Props = {
  name: string;
  phone: string;
  email: string | null;
  quickActions: QuickAction[];
  menuItems: MenuItem[];
};

const QUICK_ICONS: Record<string, React.ReactNode> = {
  "My bookings": <ClipboardIcon />,
  Notifications: <FlaticonIcon name="bell" size={20} />,
  "Saved services": <DeviceIcon />,
  "Help & support": <HeadsetIcon />,
};

const MENU_ICONS: Record<string, React.ReactNode> = {
  "My Plans": <ReceiptIcon />,
  Wallet: <WalletMenuIcon />,
  "Plus membership": <PlusCircleIcon />,
  "My rating": <StarIcon />,
  "Manage addresses": <PinIcon />,
  "Manage payment methods": <CardIcon />,
  Settings: <SettingsIcon />,
  "About V Solve Hub": <BrandIcon />,
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "VS";
}

export function ProfileAccountView({ name, phone, email, quickActions, menuItems }: Props) {
  const initials = getInitials(name);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* Left Column: Profile Card + Refer & Earn */}
        <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-6">
          {/* Main User Card */}
          <div className="rounded-[20px] bg-white p-6 shadow-[0_4px_16px_rgba(15,23,42,0.08)] border border-slate-100 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-r from-[#0b1c30] to-[#ea580c] opacity-95" />
            <div className="relative z-10 pt-6">
              <div className="flex items-end justify-between mb-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#ea580c] text-white font-heading font-extrabold text-2xl shadow-lg ring-4 ring-white">
                  {initials}
                </div>
                <Link
                  href="/profile/edit"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[#0b1c30] transition-colors hover:bg-slate-200"
                  aria-label="Edit profile"
                >
                  <EditIcon />
                </Link>
              </div>
              <h1 className="font-heading text-xl font-extrabold text-[#0b1c30] truncate">{name}</h1>
              <p className="text-xs font-semibold text-[#45464d] mt-1 flex items-center gap-1.5">
                <span>📱</span> {phone}
              </p>
              <p className="text-xs font-semibold text-[#76777d] mt-0.5 truncate">
                {email ?? "Add your email"}
              </p>
            </div>
          </div>

          {/* Refer & Earn Banner */}
          <motion.div
            whileHover={{ scale: 1.01 }}
            className="rounded-[20px] bg-gradient-to-br from-[#0b1c30] via-[#ea580c] to-[#c2410c] p-6 text-white relative overflow-hidden shadow-[0_4px_16px_rgba(15,23,42,0.12)] cursor-pointer"
            onClick={() => alert("Referral link coming soon!")}
          >
            <div className="relative z-10 pr-10">
              <span className="inline-block rounded-full bg-white/20 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-100 mb-2">
                REWARD PROGRAM
              </span>
              <h2 className="font-heading text-lg font-bold text-white mb-1">Refer & earn ₹100</h2>
              <p className="text-xs font-medium text-orange-100 leading-relaxed mb-4">
                Get ₹100 instant credit when your friend completes their first service booking.
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-[#ea580c] shadow-sm hover:bg-slate-50 transition-colors">
                Refer now →
              </span>
            </div>
            <span className="absolute -right-2 -bottom-2 text-7xl opacity-20 transform -rotate-12 pointer-events-none" aria-hidden>
              🎁
            </span>
          </motion.div>
        </aside>

        {/* Right Column: Quick Actions + Navigation Menu + Logout */}
        <main className="lg:col-span-8 space-y-6">
          {/* Quick Actions Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="group flex flex-col items-center gap-2.5 p-4 rounded-[16px] bg-white border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.06)] hover:border-[#ea580c] hover:shadow-md transition-all text-center"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#fff7ed] text-[#ea580c] group-hover:bg-[#ea580c] group-hover:text-white transition-colors">
                  {QUICK_ICONS[action.label]}
                </div>
                <span className="text-xs font-bold text-[#0b1c30] group-hover:text-[#ea580c] leading-snug">
                  {action.label}
                </span>
              </Link>
            ))}
          </div>

          {/* Menu Navigation List */}
          <div className="rounded-[20px] bg-white border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.08)] overflow-hidden divide-y divide-slate-100">
            {menuItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="group flex items-center gap-4 px-6 py-4.5 hover:bg-slate-50/80 transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#fff7ed] text-[#ea580c] group-hover:bg-[#ea580c] group-hover:text-white transition-colors">
                  {MENU_ICONS[item.label]}
                </div>
                <span className="flex-1 text-sm font-bold text-[#0b1c30] group-hover:text-[#ea580c] transition-colors">
                  {item.label}
                </span>
                <span className="text-slate-400 group-hover:text-[#ea580c] transition-colors text-sm">
                  <ChevronIcon />
                </span>
              </Link>
            ))}
          </div>

          {/* Logout Block */}
          <div className="rounded-[20px] bg-white border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.08)] p-2">
            <LogoutButton />
          </div>

          <p className="text-center text-[11px] font-bold uppercase tracking-widest text-slate-400 pt-2">
            Vsolve Hub v1.0.0
          </p>
        </main>
      </div>
    </div>
  );
}

export function LogoutButton() {
  const logoutMutation = useLogoutMutation();

  function logout() {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        window.location.href = "/";
      },
    });
  }

  return (
    <button
      type="button"
      className="w-full flex items-center justify-center gap-2 py-3.5 text-sm font-bold text-red-600 hover:bg-red-50 rounded-[16px] transition-colors disabled:opacity-50 cursor-pointer focus:outline-none"
      onClick={logout}
      disabled={logoutMutation.isPending}
    >
      {logoutMutation.isPending ? "Logging out…" : "Logout"}
    </button>
  );
}

function EditIcon() {
  return <FlaticonIcon name="pen-clip" size={16} />;
}

function ChevronIcon() {
  return <FlaticonIcon name="angle-right" size={16} />;
}
