import { Plus, RotateCcw, Trash2 } from "lucide-react";

import { StrategyPipelineView } from "@/components/strategy/StrategyPipelineView";
import { Button } from "@/components/ui/button";
import type { StrategyDraft, StrategyTemplate } from "@/types/strategy";

type StrategyCanvasProps = {
  draft: StrategyDraft;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onUpdateNodePositions: (
    nodes: Array<{ id: string; position: { x: number; y: number } }>,
  ) => void;
  onAddCondition: () => void;
  onResetTemplate: (template: StrategyTemplate) => void;
  onRemoveSelected: () => void;
};

export function StrategyCanvas({
  draft,
  selectedNodeId,
  onSelectNode,
  onAddCondition,
  onResetTemplate,
  onRemoveSelected,
}: StrategyCanvasProps) {

  return (
    <div className="glass-panel rounded-sm">
      <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAddCondition}
            className="inline-flex items-center gap-2 rounded-sm border border-border bg-secondary px-3 py-2 text-xs font-semibold tracking-[0.14em] text-foreground uppercase transition-all hover:bg-surface-elevated"
          >
            <Plus className="size-3.5" />
            Add condition
          </button>
          <button
            type="button"
            onClick={onRemoveSelected}
            disabled={!selectedNodeId || selectedNodeId === "trigger-1"}
            className="inline-flex items-center gap-2 rounded-sm border border-border bg-secondary px-3 py-2 text-xs font-semibold tracking-[0.14em] text-foreground uppercase transition-all hover:bg-surface-elevated disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
            Remove step
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 rounded-sm border border-border bg-secondary px-3 py-2 text-xs font-semibold tracking-[0.14em] text-muted uppercase">
            Template
            <select
              aria-label="Strategy template"
              value={draft.template}
              onChange={(event) =>
                onResetTemplate(event.currentTarget.value as StrategyTemplate)
              }
              className="bg-transparent text-foreground outline-none"
            >
              <option value="dca_buy">DCA</option>
              <option value="rebalance_to_target">Rebalance</option>
              <option value="alert_only">Alert</option>
            </select>
          </label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="rounded-sm text-xs tracking-[0.14em] uppercase"
            onClick={() => onResetTemplate(draft.template)}
          >
            <RotateCcw className="mr-1.5 size-3.5" />
            Reset template
          </Button>
        </div>
      </div>

      <div className="min-h-[min(520px,70vh)] h-[min(560px,72vh)] w-full">
        {draft.nodes.length === 0 ? (
          <div
            className="flex h-full min-h-[min(520px,70vh)] flex-col items-center justify-center gap-4 px-6 text-center"
            role="status"
          >
            <p className="max-w-sm text-sm text-muted">
              This draft has no nodes. Reset the template to load a valid trigger, optional conditions, and one
              terminal action.
            </p>
            <Button
              type="button"
              className="rounded-sm"
              onClick={() => onResetTemplate(draft.template)}
            >
              Reset template
            </Button>
          </div>
        ) : (
          <StrategyPipelineView
            draft={draft}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
          />
        )}
      </div>
    </div>
  );
}
