import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function StatusIndicator({
  active,
  pulse = false,
  className,
}: {
  active: boolean;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative flex h-3 w-3 items-center justify-center", className)}>
      {active && pulse && (
        <motion.div
          animate={{ scale: [1, 2.5], opacity: [0.5, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
          className="absolute inset-0 rounded-sm bg-emerald-500"
        />
      )}
      <div
        className={cn(
          "h-2 w-2 rounded-sm transition-colors duration-100 ease-out",
          active ? "bg-emerald-400 shadow-none border border-white/5" : "bg-white/20"
        )}
      />
    </div>
  );
}
