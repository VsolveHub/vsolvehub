import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import type { Address } from "./model";
import { motion } from "framer-motion";

type Props = {
  isLoggedIn: boolean;
  addresses: Address[];
  redirectAfterLogin: string;
  detectButton: React.ReactNode;
  onSelectAddress: (id: string) => void;
  onAddNew: () => void;
  onClose: () => void;
};

export function AddressListView({ isLoggedIn, addresses, redirectAfterLogin, detectButton, onSelectAddress, onAddNew, onClose }: Props) {
  return (
    <div className="flex flex-col gap-5">
      {detectButton}

      {isLoggedIn ? (
        <>
          <div className="flex flex-col gap-3">
            {addresses.map((addr) => {
              const active = getCookie("location_id") === addr.id || addr.isDefault;
              return (
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  key={addr.id}
                  className={`relative flex items-start gap-4 p-4 rounded-[16px] cursor-pointer border transition-all ${
                    active ? "bg-[var(--color-brand-light)] border-[var(--color-brand)] shadow-sm" : "bg-white border-gray-200 hover:border-gray-300 shadow-sm"
                  }`}
                  onClick={() => onSelectAddress(addr.id)}
                >
                  <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${active ? "bg-[var(--color-brand)] text-white" : "bg-gray-100 text-gray-500"}`}>
                    📍
                  </div>
                  <div className="flex-1 min-w-0 pr-6">
                    <p className={`text-sm font-black truncate ${active ? "text-[var(--color-brand)]" : "text-gray-900"}`}>{addr.label}</p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{addr.fullAddress}</p>
                  </div>
                  {active && (
                    <div className="absolute top-4 right-4 w-5 h-5 rounded-full bg-[var(--color-brand)] flex items-center justify-center shadow-sm">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  )}
                </motion.div>
              );
            })}
            {addresses.length === 0 && (
              <p className="text-sm font-semibold text-gray-400 text-center py-6">
                No saved addresses yet.
              </p>
            )}
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full py-3 px-4 rounded-xl font-bold text-sm text-[var(--color-brand)] bg-white border-2 border-dashed border-gray-300 hover:border-[var(--color-brand)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/50"
            onClick={onAddNew}
          >
            + Add new address
          </motion.button>
        </>
      ) : (
        <div className="flex flex-col gap-4 text-center mt-2 bg-white p-6 rounded-2xl border border-gray-150 shadow-sm">
          <div className="w-12 h-12 bg-[var(--color-brand-light)] text-[var(--color-brand)] rounded-full flex items-center justify-center mx-auto text-xl mb-1 shadow-sm">
            🏠
          </div>
          <p className="text-sm font-semibold text-gray-600 leading-relaxed mb-1">
            Log in to save addresses to your account, or set one for this session below.
          </p>
          <Link
            href={`/booking/otp?redirect=${encodeURIComponent(redirectAfterLogin)}`}
            className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-[var(--color-brand)] shadow-lg shadow-[var(--color-brand)]/20 hover:opacity-90 transition-opacity focus:outline-none"
            onClick={onClose}
          >
            Log In / Register
          </Link>
          <button
            className="w-full py-3 px-4 rounded-xl font-bold text-sm text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors focus:outline-none"
            onClick={onAddNew}
          >
            Enter address manually
          </button>
        </div>
      )}
    </div>
  );
}
