import { useMemo, useState } from "react";
import { ExternalLink, History } from "lucide-react";

import type { TransactionDisplay } from "@/hooks/useTransactions";
import { EmptyState } from "@/components/shared/EmptyState";

type TransactionListProps = {
  transactions: TransactionDisplay[];
  isLoading?: boolean;
};

function formatTimestamp(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function categoryLabel(cat: string | null): string {
  if (!cat) return "Transfer";
  const map: Record<string, string> = {
    external: "Transfer",
    internal: "Internal",
    erc20: "Token",
    erc721: "NFT",
    erc1155: "NFT",
  };
  return map[cat.toLowerCase()] ?? cat;
}

export function TransactionList({ transactions, isLoading }: TransactionListProps) {
  const [chainFilter, setChainFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      const chainOk = chainFilter === "All" || tx.chain === chainFilter;
      const catOk =
        categoryFilter === "All" ||
        (tx.category?.toLowerCase() === categoryFilter.toLowerCase());
      return chainOk && catOk;
    });
  }, [transactions, chainFilter, categoryFilter]);

  const chains = useMemo(() => {
    const s = new Set(transactions.map((t) => t.chain));
    return Array.from(s).sort();
  }, [transactions]);

  const categories = useMemo(() => {
    const s = new Set(
      transactions
        .map((t) => t.category?.toLowerCase())
        .filter(Boolean) as string[],
    );
    return Array.from(s).sort();
  }, [transactions]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-2xl border border-border bg-secondary"
          />
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={<History className="size-5" />}
        title="No transactions yet"
        description="Transaction history will appear here after you send or receive assets. Sync your wallet to fetch past activity."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          <span>Chain</span>
          <select
            value={chainFilter}
            onChange={(e) => setChainFilter(e.target.value)}
            className="rounded-xl border border-border bg-secondary px-3 py-2 text-foreground outline-none"
          >
            <option value="All">All</option>
            {chains.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          <span>Type</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-xl border border-border bg-secondary px-3 py-2 text-foreground outline-none"
          >
            <option value="All">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-2">
        {filtered.map((tx) => (
          <a
            key={tx.id}
            href={tx.blockExplorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-4 py-3 transition-colors hover:border-primary/30 hover:bg-surface-elevated"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">
                  {categoryLabel(tx.category)}
                </span>
                <span className="rounded-full border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted">
                  {tx.chain}
                </span>
              </div>
              <p className="mt-0.5 truncate font-mono text-xs text-muted">
                {tx.txHash.slice(0, 10)}…{tx.txHash.slice(-8)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {tx.value ? (
                <span className="text-sm font-medium text-foreground">
                  {tx.value}
                </span>
              ) : null}
              <span className="text-xs text-muted">
                {formatTimestamp(tx.timestamp)}
              </span>
              <ExternalLink className="size-4 shrink-0 text-muted" />
            </div>
          </a>
        ))}
      </div>

      {filtered.length === 0 && transactions.length > 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          No transactions match the selected filters.
        </p>
      ) : null}
    </div>
  );
}
