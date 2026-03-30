import { ChevronDown } from "lucide-react";

type PortfolioFiltersProps = {
  chain: string;
  sort: string;
  type: string;
  developerModeEnabled?: boolean;
  installedAppIds?: string[];
  onChainChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onTypeChange: (value: string) => void;
};

const CHAINS: {
  label: string;
  value: string;
  testnet?: boolean;
  appGated?: string;
}[] = [
  { label: "All Chains", value: "All" },
  { label: "Ethereum", value: "ETH" },
  { label: "Base", value: "BASE" },
  { label: "Polygon", value: "POL" },
  { label: "Flow (Cadence)", value: "FLOW", appGated: "flow" },
  { label: "Flow EVM", value: "FLOW-EVM", appGated: "flow" },
  { label: "ETH Sepolia", value: "ETH-SEP", testnet: true },
  { label: "Base Sepolia", value: "BASE-SEP", testnet: true },
  { label: "Polygon Amoy", value: "POL-AMOY", testnet: true },
  { label: "Flow Testnet (Cadence)", value: "FLOW-TEST", testnet: true, appGated: "flow" },
  { label: "Flow EVM Testnet", value: "FLOW-EVM-TEST", testnet: true, appGated: "flow" },
];

const TYPES = [
  { label: "All Assets", value: "All" },
  { label: "Tokens", value: "token" },
  { label: "Native", value: "native" },
  { label: "Stablecoins", value: "stablecoin" },
];

const SORTS = [
  { label: "Value", value: "Value" },
  { label: "Chain", value: "Chain" },
  { label: "Symbol", value: "Symbol" },
];

export function PortfolioFilters({
  chain,
  sort,
  type,
  developerModeEnabled = false,
  installedAppIds = [],
  onChainChange,
  onSortChange,
  onTypeChange,
}: PortfolioFiltersProps) {
  const filteredChains = CHAINS.filter((c) => {
    // Hide app-gated chains if their app isn't installed
    if (c.appGated && !installedAppIds.includes(c.appGated)) {
      return false;
    }
    // Hide testnets unless developer mode is on
    if (c.testnet) {
      return developerModeEnabled;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 items-center gap-2 overflow-x-auto pb-2 scrollbar-hide sm:pb-0">
        <div className="flex items-center gap-1.5 rounded-sm border border-border bg-secondary p-1 shadow-none border border-white/5">
          {filteredChains.map((c) => (
            <button
              key={c.value}
              onClick={() => onChainChange(c.value)}
              className={`whitespace-nowrap rounded-sm px-3.5 py-1.5 text-xs font-medium transition-all ${
                chain === c.value
                  ? "bg-primary text-primary-foreground shadow-none border border-white/5"
                  : "text-muted hover:bg-surface-elevated hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-sm border border-border bg-secondary p-1 shadow-none border border-white/5">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => onTypeChange(t.value)}
              className={`whitespace-nowrap rounded-sm px-3.5 py-1.5 text-xs font-medium transition-all ${
                type === t.value
                  ? "bg-surface-elevated text-foreground shadow-none border border-white/5"
                  : "text-muted hover:bg-surface-elevated hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative group">
          <select
            aria-label="Sort assets"
            value={sort}
            onChange={(event) => onSortChange(event.currentTarget.value)}
            className="appearance-none rounded-sm border border-border bg-secondary pl-3.5 pr-8 py-2 text-xs font-medium text-foreground outline-none transition-colors hover:bg-surface-elevated"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                Sort: {s.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
        </div>
      </div>
    </div>
  );
}
