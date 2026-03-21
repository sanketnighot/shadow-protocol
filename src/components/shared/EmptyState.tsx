import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  actionLabel?: string;
  description: string;
  icon: ReactNode;
  title: string;
  onAction?: () => void;
};

export function EmptyState({
  actionLabel,
  description,
  icon,
  title,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="glass-panel flex flex-col items-start gap-4 rounded-sm p-6">
      <div className="rounded-[22px] border border-primary/15 bg-primary/10 p-3 text-primary">
        {icon}
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground">{title}</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {actionLabel && onAction ? (
        <Button type="button" className="rounded-sm px-5" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
