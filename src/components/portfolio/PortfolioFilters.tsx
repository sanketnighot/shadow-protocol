type PortfolioFiltersProps = {
  chain: string;
  sort: string;
  type: string;
  onChainChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onTypeChange: (value: string) => void;
};

export function PortfolioFilters({
  chain,
  sort,
  type,
  onChainChange,
  onSortChange,
  onTypeChange,
}: PortfolioFiltersProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="grid gap-2 text-sm text-muted">
        <span className="sr-only">Chain filter</span>
        <span>Chain</span>
        <select
          aria-label="Chain filter"
          value={chain}
          onChange={(event) => onChainChange(event.currentTarget.value)}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-foreground outline-none"
        >
          <option value="All">All</option>
          <option value="ETH">Ethereum</option>
          <option value="ARB">Arbitrum</option>
          <option value="BASE">Base</option>
          <option value="SOL">Solana</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm text-muted">
        <span>Type</span>
        <select
          aria-label="Asset type filter"
          value={type}
          onChange={(event) => onTypeChange(event.currentTarget.value)}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-foreground outline-none"
        >
          <option value="All">All</option>
          <option value="token">Token</option>
          <option value="stablecoin">Stablecoin</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm text-muted">
        <span>Sort</span>
        <select
          aria-label="Sort assets"
          value={sort}
          onChange={(event) => onSortChange(event.currentTarget.value)}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-foreground outline-none"
        >
          <option value="Value">Value</option>
          <option value="Chain">Chain</option>
          <option value="Symbol">Symbol</option>
        </select>
      </label>
    </div>
  );
}
