import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

type ChainPillProps = {
  symbol: string;
  name: string;
  valueLabel: string;
  allocation: number;
  className?: string;
};

export function ChainPill({
  symbol,
  name,
  valueLabel,
  allocation,
  className,
}: ChainPillProps) {
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      className={cn(
        "glass-panel min-w-0 rounded-2xl px-4 py-3 transition-transform",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-[0.24em] text-muted uppercase">
            {symbol}
          </p>
          <p className="mt-2 text-sm font-semibold text-foreground">{valueLabel}</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-muted">
          {allocation}%
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">{name}</p>
    </motion.div>
  );
}
