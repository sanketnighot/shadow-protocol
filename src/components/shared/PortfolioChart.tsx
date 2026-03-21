import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";

import type { PortfolioPoint } from "@/data/mock";

type PortfolioChartProps = {
  data: PortfolioPoint[];
};

export function PortfolioChart({ data }: PortfolioChartProps) {
  const isTest = typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
  const formatTooltipValue = (
    value: number | string | ReadonlyArray<number | string> | undefined,
  ) => {
    if (typeof value === "number") {
      return `$${value.toLocaleString()}`;
    }

    return Array.isArray(value) ? value.join(", ") : String(value ?? "");
  };

  if (isTest) {
    return (
      <div className="h-44 w-full rounded-sm border border-white/10 bg-white/5 p-4">
        <div className="flex h-full items-end gap-2">
          {data.map((point) => (
            <div key={point.day} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="w-full rounded-t-full bg-primary/60"
                style={{ height: `${Math.max(28, point.value / 90)}px` }}
              />
              <span className="font-mono text-[10px] text-muted">{point.day}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-44 w-full rounded-sm border border-border bg-surface-elevated/50 px-2 py-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="portfolio-glow" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.6} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={{ stroke: "rgba(139,92,246,0.3)", strokeWidth: 1 }}
            contentStyle={{
              border: "1px solid var(--panel-border)",
              borderRadius: "16px",
              backgroundColor: "var(--bg-tertiary)",
              boxShadow: "var(--shadow-none border border-white/5)",
            }}
            formatter={(value) => [formatTooltipValue(value), "Value"]}
            labelStyle={{ color: "var(--text-secondary)" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#8b5cf6"
            strokeWidth={3}
            fill="url(#portfolio-glow)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
