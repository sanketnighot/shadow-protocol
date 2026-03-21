import { Database, PieChart, Wallet, TrendingUp } from "lucide-react";

type ToolResultCardProps = {
  toolName: string;
  content: string;
};

function PortfolioCard({ data }: { data: Record<string, unknown> }) {
  const unwrapped = (data.Ok as Record<string, unknown>) ?? data;
  const totalUsd = (unwrapped.totalUsd as string) ?? (unwrapped.total_usd as string) ?? "$0.00";
  const walletCount = (unwrapped.walletCount as number) ?? (unwrapped.wallet_count as number) ?? 0;
  const breakdown = Array.isArray(unwrapped.breakdown) ? unwrapped.breakdown : [];
  return (
    <div className="rounded-2xl border border-border bg-secondary p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
            <PieChart className="size-4" />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            Portfolio Aggregate
          </span>
        </div>
        <span className="text-[10px] font-semibold text-muted bg-surface-elevated px-2 py-0.5 rounded-full">
          {walletCount} Wallet{walletCount !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="mb-4">
        <p className="text-3xl font-bold tracking-tight text-foreground">{totalUsd}</p>
      </div>
      {breakdown.length > 0 && (
        <div className="grid gap-2">
          {(breakdown as Record<string, unknown>[]).map((item, i) => {
            const token = (item.token as string) ?? "?";
            const amount = (item.amount as string) ?? "0";
            const value = (item.value as string) ?? "$0";
            return (
              <div key={i} className="flex items-center justify-between rounded-xl bg-surface-elevated/50 p-2.5 transition-colors hover:bg-surface-elevated">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-white/5 font-bold text-[10px]">
                    {token.slice(0, 2)}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-foreground">{token}</span>
                    <span className="text-[10px] text-muted">{amount}</span>
                  </div>
                </div>
                <span className="text-xs font-bold text-foreground">{value}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BalancesCard({ data }: { data: unknown }) {
  const unwrapped = (data as any)?.Ok ?? data;
  const items = Array.isArray(unwrapped) ? unwrapped : [];
  return (
    <div className="rounded-2xl border border-border bg-secondary p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
          <Wallet className="size-4" />
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          Real-time Balances
        </span>
      </div>
      <div className="grid gap-2">
        {(items as Record<string, unknown>[]).slice(0, 8).map((item, i) => (
          <div key={i} className="flex items-center justify-between rounded-xl bg-surface-elevated/50 p-2.5">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-foreground">{(item.token as string) ?? "?"}</span>
              <span className="text-[10px] text-muted">on {(item.chain as string) ?? "?"}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs font-bold text-foreground">{(item.valueUsd as string) ?? (item.value_usd as string) ?? "$0"}</span>
              <span className="text-[10px] text-muted">{(item.amount as string) ?? "0"}</span>
            </div>
          </div>
        ))}
        {items.length > 8 && (
          <p className="px-1 text-[10px] text-muted">+{items.length - 8} more assets...</p>
        )}
      </div>
    </div>
  );
}

function PriceCard({ data }: { data: Record<string, unknown> }) {
  const unwrapped = (data.Ok as Record<string, unknown>) ?? data;
  const price = (unwrapped.priceUsd as number) ?? (unwrapped.price_usd as number) ?? 0;
  const source = (unwrapped.source as string) ?? "Oracle";
  
  return (
    <div className="rounded-2xl border border-border bg-secondary p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/20 text-primary shadow-inner">
          <TrendingUp className="size-5" />
        </div>
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            Market Price
          </span>
          <p className="text-2xl font-bold tracking-tight text-foreground">
            ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </p>
        </div>
      </div>
      <div className="text-right">
        <span className="text-[9px] font-bold text-muted uppercase tracking-tighter bg-surface-elevated px-1.5 py-0.5 rounded">
          {source}
        </span>
      </div>
    </div>
  );
}

export function ToolResultCard({ toolName, content }: ToolResultCardProps) {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }

  const name = toolName ?? "unknown_tool";
  const isPortfolio = name.includes("get_total_portfolio_value");
  const isBalances = name.includes("get_wallet_balances");
  const isPrice = name.includes("get_token_price");

  if (isPortfolio && parsed && typeof parsed === "object") {
    return <PortfolioCard data={parsed} />;
  }
  if (isBalances && parsed) {
    return <BalancesCard data={parsed} />;
  }
  if (isPrice && parsed && typeof parsed === "object") {
    return <PriceCard data={parsed} />;
  }

  return (
    <div className="rounded-xl border border-border bg-surface-elevated/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Database className="size-3.5 text-muted" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {name} Result
        </span>
      </div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted/90 scrollbar-hide">
        {typeof parsed === "object" && parsed !== null
          ? JSON.stringify(parsed, null, 2)
          : String(content)}
      </pre>
    </div>
  );
}
