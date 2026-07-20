"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ProfileSubPage } from "./ProfileSubPage";
import { formatPhone } from "@/lib/format";
import { useUpdateProfileMutation } from "@/lib/query/hooks";
import { motion, AnimatePresence } from "framer-motion";

type Props = {
  name: string;
  phone: string;
};

export function ProfileEditForm({ name, phone }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState(name);
  const [error, setError] = useState("");
  const updateProfileMutation = useUpdateProfileMutation();
  const loading = updateProfileMutation.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    updateProfileMutation.mutate({ name: fullName.trim() }, {
      onSuccess: () => {
        router.push("/profile");
        router.refresh();
      },
      onError: (err: any) => {
        setError(err.message || "Could not save profile");
      }
    });
  }

  return (
    <ProfileSubPage title="Edit profile">
      <form className="flex flex-col gap-6" onSubmit={onSubmit}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="profile-name" className="text-xs font-black text-gray-500 uppercase tracking-wider">Full name</label>
          <input
            id="profile-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-transparent transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-400"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="profile-phone" className="text-xs font-black text-gray-500 uppercase tracking-wider">Mobile number</label>
          <input
            id="profile-phone"
            value={formatPhone(phone)}
            readOnly
            aria-describedby="profile-phone-hint"
            className="w-full px-4 py-3 rounded-xl border border-gray-100 bg-gray-100/80 text-gray-500 cursor-not-allowed transition-all text-sm font-semibold"
          />
          <p id="profile-phone-hint" className="text-[11px] font-semibold text-gray-400 mt-1">
            Phone number is tied to your login and cannot be changed here.
          </p>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-xs font-semibold border border-red-200"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit" 
          disabled={loading || !fullName.trim()}
          className="w-full mt-2 py-4 px-6 bg-[var(--color-brand)] text-white rounded-xl text-sm font-black shadow-xl shadow-[var(--color-brand)]/20 disabled:opacity-60 transition-opacity flex items-center justify-center gap-2 focus:outline-none"
        >
          {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : "Save changes"}
        </motion.button>
      </form>
    </ProfileSubPage>
  );
}
