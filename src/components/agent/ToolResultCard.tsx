import { Database, PieChart, Wallet, TrendingUp } from "lucide-react";

type ToolResultCardProps = {
  toolName: string;
  content: string;
};

function PortfolioCard({ data }: { data: Record<string, unknown> }) {
  const unwrapped = (data.Ok as Record<string, unknown>) ?? data;
  const totalUsd = (unwrapped.totalUsd as string) ?? "$0.00";
  const walletCount = (unwrapped.walletCount as number) ?? 0;
  const breakdown = Array.isArray(unwrapped.breakdown) ? unwrapped.breakdown : [];
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
      <div className="mb-2 flex items-center gap-2">
        <PieChart className="size-3.5 text-primary/80" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          Portfolio
        </span>
      </div>
      <p className="mb-2 text-lg font-semibold text-primary">{totalUsd}</p>
      <p className="mb-3 text-[11px] text-muted">
        across {walletCount} wallet{walletCount !== 1 ? "s" : ""}
      </p>
      {breakdown.length > 0 && (
        <div className="max-h-64 space-y-3 overflow-auto border-t border-white/5 pt-2">
          {(breakdown as Record<string, unknown>[]).map((item, i) => {
            const token = (item.token as string) ?? "?";
            const amount = (item.amount as string) ?? "0";
            const value = (item.value as string) ?? "$0";
            const chains = item.chains as string | undefined;
            const holdings = Array.isArray(item.holdings) ? item.holdings : [];
            return (
              <div key={i} className="rounded-lg bg-white/[0.02] px-2 py-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-foreground/95">{token}</span>
                  <span className="text-foreground/85">
                    {amount} {token} ({value})
                  </span>
                </div>
                {chains && (
                  <p className="mt-0.5 text-[10px] text-muted">Chains: {chains}</p>
                )}
                {holdings.length > 0 && (
                  <div className="mt-1.5 space-y-1 border-t border-white/5 pt-1.5">
                    {(holdings as Record<string, unknown>[]).map((h, j) => (
                      <div
                        key={j}
                        className="flex justify-between gap-2 text-[10px] text-muted"
                      >
                        <span>{(h.wallet as string) ?? "?"} · {(h.chain as string) ?? "?"}</span>
                        <span>
                          {(h.amount as string) ?? "0"} ({(h.value as string) ?? "$0"})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BalancesCard({ data }: { data: unknown }) {
  const items = Array.isArray(data) ? data : [];
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
      <div className="mb-2 flex items-center gap-2">
        <Wallet className="size-3.5 text-primary/80" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          Balances
        </span>
      </div>
      <div className="max-h-40 space-y-1.5 overflow-auto">
        {(items as Record<string, unknown>[]).slice(0, 8).map((item, i) => (
          <div key={i} className="flex justify-between gap-3 text-xs">
            <span className="shrink-0 text-foreground/85">
              {(item.token as string) ?? "?"} on {(item.chain as string) ?? "?"}
            </span>
            <span className="shrink-0 font-medium text-foreground/95">
              {(item.amount as string) ?? "0"} ({(item.valueUsd as string) ?? "$0"})
            </span>
          </div>
        ))}
        {items.length > 8 && (
          <p className="pt-0.5 text-[10px] text-muted">+{items.length - 8} more</p>
        )}
      </div>
    </div>
  );
}

function PriceCard({ data }: { data: Record<string, unknown> }) {
  const price = (data.priceUsd as number) ?? 0;
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <TrendingUp className="size-3.5 text-primary/80" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          Price
        </span>
      </div>
      <p className="text-lg font-semibold text-primary">${price.toFixed(4)}</p>
    </div>
  );
}

export function ToolResultCard({ toolName, content }: ToolResultCardProps) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }

  if (toolName === "get_total_portfolio_value" && parsed && typeof parsed === "object") {
    return <PortfolioCard data={parsed as Record<string, unknown>} />;
  }
  if (toolName === "get_wallet_balances" && Array.isArray(parsed)) {
    return <BalancesCard data={parsed} />;
  }
  if (toolName === "get_token_price" && parsed && typeof parsed === "object") {
    return <PriceCard data={parsed as Record<string, unknown>} />;
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="mb-1.5 flex items-center gap-2">
        <Database className="size-3.5 text-primary/80" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {toolName}
        </span>
      </div>
      <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs text-foreground/85">
        {typeof parsed === "object" && parsed !== null
          ? JSON.stringify(parsed, null, 2)
          : String(content)}
      </pre>
    </div>
  );
}
