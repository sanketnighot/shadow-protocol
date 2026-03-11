import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";

type WalletEmptyStateProps = {
  onCreate: () => void;
  onImport: () => void;
  title?: string;
  description?: string;
};

export function WalletEmptyState({
  onCreate,
  onImport,
  title = "No wallet",
  description = "Create a new EVM wallet or import an existing one to view your portfolio and execute transactions.",
}: WalletEmptyStateProps) {
  return (
    <div className="space-y-4">
      <EmptyState
        icon={<Wallet className="size-5" />}
        title={title}
        description={description}
        actionLabel="Create wallet"
        onAction={onCreate}
      />
      <div className="flex justify-center">
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-white/10 bg-white/5"
          onClick={onImport}
        >
          Import wallet
        </Button>
      </div>
    </div>
  );
}
