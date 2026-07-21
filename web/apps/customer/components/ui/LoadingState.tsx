import { Spinner } from "@/components/ui/Spinner";
import { motion } from "framer-motion";

type LoadingStateProps = {
  label?: string;
  variant?: "page" | "inline" | "partner" | "compact";
  className?: string;
};

export function LoadingState({
  label = "Loading…",
  variant = "page",
  className = "",
}: LoadingStateProps) {
  const isPage = variant === "page" || variant === "partner";
  
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`flex flex-col items-center justify-center gap-4 ${isPage ? "min-h-[60vh] w-full p-8" : "p-4 w-full"} ${className}`.trim()}
    >
      <div className="relative">
        <div className={`absolute inset-0 rounded-full blur-md opacity-40 bg-[var(--color-brand-light)] ${isPage ? "w-12 h-12" : "w-8 h-8"} -translate-x-1/2 left-1/2`}></div>
        <Spinner size={variant === "compact" ? "sm" : isPage ? "lg" : "md"} className="relative z-10" />
      </div>
      {label && (
        <motion.p 
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`font-bold tracking-wide animate-pulse ${isPage ? "text-gray-500 text-sm" : "text-gray-400 text-xs"}`}
        >
          {label}
        </motion.p>
      )}
    </motion.div>
  );
}
