import type { ReactNode } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TabId = "tokens" | "nfts" | "transactions";

type PortfolioTabsProps = {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  tokensContent: ReactNode;
  nftsContent: ReactNode;
  transactionsContent: ReactNode;
};

export function PortfolioTabs({
  activeTab,
  onTabChange,
  tokensContent,
  nftsContent,
  transactionsContent,
}: PortfolioTabsProps) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as TabId)}
      className="w-full"
    >
      <TabsList className="mb-6 h-auto w-full flex-wrap justify-start gap-1 rounded-sm border border-border bg-secondary p-1">
        <TabsTrigger
          value="tokens"
          className="rounded-sm px-4 py-2.5 data-[state=active]:bg-surface-elevated data-[state=active]:text-foreground"
        >
          Tokens
        </TabsTrigger>
        <TabsTrigger
          value="nfts"
          className="rounded-sm px-4 py-2.5 data-[state=active]:bg-surface-elevated data-[state=active]:text-foreground"
        >
          NFTs
        </TabsTrigger>
        <TabsTrigger
          value="transactions"
          className="rounded-sm px-4 py-2.5 data-[state=active]:bg-surface-elevated data-[state=active]:text-foreground"
        >
          Transactions
        </TabsTrigger>
      </TabsList>

      {activeTab === "tokens" && tokensContent}
      {activeTab === "nfts" && nftsContent}
      {activeTab === "transactions" && transactionsContent}
    </Tabs>
  );
}
