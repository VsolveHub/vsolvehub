"use client";

import { motion, type Variants } from "framer-motion";
import { WHY_CHOOSE } from "@/lib/catalog/display-catalog";
import { ServiceIcon } from "@/components/ui/ServiceIcons";
import { SectionHeading } from "./SectionHeading";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 200 } },
};

export function WhyChoose() {
  return (
    <div className="w-full">
      <SectionHeading eyebrow="The V Solve promise" title="Why choose V Solve Hub?" />
      <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {WHY_CHOOSE.map((item) => (
          <motion.div variants={itemVariants} whileHover={{ y: -5, scale: 1.05 }} key={item.label} className="flex flex-col items-center justify-center p-6 bg-white rounded-[24px] border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-50 mb-4 shadow-inner">
              <ServiceIcon name={item.icon} size={32} color={item.color} />
            </span>
            <span className="text-sm font-bold text-gray-900 text-center leading-tight">{item.label}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
