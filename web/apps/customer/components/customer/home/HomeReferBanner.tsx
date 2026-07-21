import Link from "next/link";
import { motion } from "framer-motion";

export function HomeReferBanner() {
  return (
    <div className="w-full bg-gradient-to-r from-yellow-50 to-orange-50 rounded-[32px] p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 border border-yellow-100 shadow-sm" aria-label="Refer and earn">
      <div className="flex-1 text-center sm:text-left">
        <h2 className="text-xl sm:text-2xl font-black text-yellow-900 tracking-tight mb-2">Refer &amp; earn ₹100</h2>
        <p className="text-sm font-semibold text-yellow-800/80">Invite friends — you both get wallet credit on their first booking.</p>
      </div>
      <Link href="/profile" className="inline-flex items-center justify-center shrink-0 w-full sm:w-auto px-6 py-3 bg-yellow-400 text-yellow-900 rounded-2xl text-sm font-black shadow-md hover:bg-yellow-500 transition-colors">
        Refer now
      </Link>
    </div>
  );
}
