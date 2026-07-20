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
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 md:py-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <aside className="lg:col-span-4 flex flex-col gap-6 sticky top-6">
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-brand-dark)] opacity-10"></div>
          <header className="flex items-center gap-5 relative z-10">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[var(--color-brand)] text-white flex items-center justify-center text-xl sm:text-2xl font-black tracking-widest shadow-xl shadow-[var(--color-brand)]/20 flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 truncate tracking-tight">{name}</h1>
              <p className="text-sm font-semibold text-gray-500 mt-1">{phone}</p>
              <p className="text-sm font-semibold text-gray-500 truncate">{email ?? "Add your email"}</p>
            </div>
            <Link 
              href="/profile/edit" 
              className="w-10 h-10 rounded-full bg-gray-50 text-gray-400 hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-light)] transition-colors flex items-center justify-center focus:outline-none flex-shrink-0" 
              aria-label="Edit profile"
            >
              <EditIcon />
            </Link>
          </header>
        </div>

        <motion.div 
          whileHover={{ scale: 1.02 }}
          className="bg-gradient-to-br from-[#4f46e5] to-[#3b82f6] rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xl shadow-blue-500/20 cursor-pointer"
          onClick={() => alert("Referral link coming soon!")}
        >
          <div className="relative z-10 pr-12">
            <h2 className="text-xl font-black mb-2 drop-shadow-sm">Refer & earn ₹100</h2>
            <p className="text-sm font-medium text-blue-100 leading-relaxed mb-4">Get ₹100 when your friend completes their first booking</p>
            <span className="inline-block py-2 px-4 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md text-sm font-bold transition-colors">
              Refer now
            </span>
          </div>
          <span className="absolute -right-4 -bottom-4 text-8xl opacity-20 transform -rotate-12" aria-hidden>
            🎁
          </span>
        </motion.div>
      </aside>

      <main className="lg:col-span-8 flex flex-col gap-6">
        <div className="grid grid-cols-4 gap-3 sm:gap-4">
          {quickActions.map((action) => (
            <Link key={action.label} href={action.href} className="group flex flex-col items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-[var(--color-brand)] hover:shadow-md transition-all text-center">
              <div className="w-12 h-12 rounded-full bg-gray-50 text-gray-600 group-hover:bg-[var(--color-brand)] group-hover:text-white flex items-center justify-center transition-colors">
                {QUICK_ICONS[action.label]}
              </div>
              <span className="text-xs sm:text-sm font-bold text-gray-700 group-hover:text-gray-900 leading-tight">{action.label}</span>
            </Link>
          ))}
        </div>

        <nav className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col divide-y divide-gray-50">
          {menuItems.map((item) => (
            <Link key={item.label} href={item.href} className="group flex items-center gap-4 px-6 py-5 hover:bg-gray-50 transition-colors">
              <span className="w-10 h-10 rounded-xl bg-gray-100 text-gray-500 group-hover:bg-[var(--color-brand)] group-hover:text-white flex items-center justify-center transition-colors">
                {MENU_ICONS[item.label]}
              </span>
              <span className="flex-1 text-sm sm:text-base font-bold text-gray-800 group-hover:text-gray-900">{item.label}</span>
              <span className="text-gray-300 group-hover:text-gray-400 transition-colors">
                <ChevronIcon />
              </span>
            </Link>
          ))}
        </nav>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-2">
          <LogoutButton />
        </div>

        <p className="text-center text-xs font-bold text-gray-400 tracking-wider uppercase mt-4">Version 1.0.0</p>
      </main>
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
      className="w-full flex items-center justify-center gap-2 py-4 text-sm font-bold text-red-500 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-colors disabled:opacity-50 focus:outline-none" 
      onClick={logout} 
      disabled={logoutMutation.isPending}
    >
      {logoutMutation.isPending ? "Logging out..." : "Logout"}
    </button>
  );
}

function EditIcon() {
  return <FlaticonIcon name="pen-clip" size={18} />;
}

function ChevronIcon() {
  return <FlaticonIcon name="angle-right" size={18} />;
}
