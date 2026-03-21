import { useCountUp } from "@/hooks/useCountUp";
import { usePortfolio } from "@/hooks/usePortfolio";
import { cn } from "@/lib/utils";

type SidebarProps = {
  className?: string;
  /** Called after navigating (e.g. close mobile drawer). */
  onNavigate?: () => void;
};

export function Sidebar({ className, onNavigate: _onNavigate }: SidebarProps) {
  const { dailyChangeLabel } = usePortfolio();
  const animatedTotalValue = useCountUp(12345.67);

  return (
    <aside
      className={cn(
        "glass-panel flex h-full min-h-0 flex-col overflow-hidden rounded-sm pb-0 pl-3 pr-3 pt-3 sm:pl-4 sm:pr-4 sm:pt-4 lg:rounded-[30px]",
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <div className="shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-primary/20 bg-primary/12 text-base font-black tracking-[0.24em] text-primary">
              S
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
                SHADOW Protocol
              </p>
              <p className="mt-1 truncate text-sm text-muted">
                Private DeFi workstation
              </p>
            </div>
          </div>
        </div>

        <div className="shrink-0 rounded-[22px] border border-primary/15 bg-primary/8 p-4">
          <p className="text-2xl font-bold tracking-[-0.03em] text-foreground">
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 2,
            }).format(animatedTotalValue)}
          </p>
          <p className="mt-1 text-sm text-emerald-300">{dailyChangeLabel}</p>
        </div>

      </div>
    </aside>
  );
}
