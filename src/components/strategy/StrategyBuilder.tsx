import { Sparkles } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { GuardrailsForm } from "@/components/strategy/GuardrailsForm";
import { StrategyCanvas } from "@/components/strategy/StrategyCanvas";
import { StrategyInspector } from "@/components/strategy/StrategyInspector";
import { StrategySimulationPanel } from "@/components/strategy/StrategySimulationPanel";
import { Skeleton } from "@/components/shared/Skeleton";
import { useStrategyBuilder } from "@/hooks/useStrategyBuilder";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";

export function StrategyBuilder() {
  const [searchParams] = useSearchParams();
  const strategyId = searchParams.get("id");
  const {
    draft,
    selectedNode,
    selectedNodeId,
    setSelectedNodeId,
    simulation,
    isCompiling,
    isSaving,
    isLoading,
    persistedStatus,
    failureCount,
    strategyBuilderEnabled,
    setTemplate,
    updateDraftMeta,
    updateGuardrails,
    updateNodeData,
    updateNodePositions,
    addCondition,
    removeSelectedNode,
    saveDraft,
    activateStrategy,
  } = useStrategyBuilder(strategyId);
  const { success, warning, info } = useToast();

  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-sm p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
              Strategy builder
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground">
              Visual no-code orchestration for DeFi automation.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
              Build a single executable pipeline: one trigger, optional ordered
              conditions, and one terminal action. Rust compiles, validates, and
              schedules the resulting automation plan.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-sm border border-primary/15 bg-primary/10 px-4 py-2 text-sm text-primary">
            <Sparkles className="size-4" />
            {draft.template.replace(/_/g, " ")} · {persistedStatus} · failures {failureCount}
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-sm p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-muted">
              Strategy name
              <input
                value={draft.name}
                onChange={(event) => updateDraftMeta({ name: event.currentTarget.value })}
                className="rounded-sm border border-border bg-secondary px-3 py-2 text-foreground outline-none"
              />
            </label>
            <label className="grid gap-2 text-sm text-muted">
              Mode
              <select
                value={draft.mode}
                onChange={(event) =>
                  updateDraftMeta({
                    mode: event.currentTarget.value as typeof draft.mode,
                  })
                }
                className="rounded-sm border border-border bg-secondary px-3 py-2 text-foreground outline-none"
              >
                <option value="monitor_only">Monitor only</option>
                <option value="approval_required">Approval required</option>
                <option value="pre_authorized">Pre-authorized</option>
              </select>
            </label>
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            <Button
              className="rounded-sm px-5"
              disabled={isSaving || !strategyBuilderEnabled}
              onClick={() => {
                void saveDraft()
                  .then(() => success("Strategy saved", "Draft strategy persisted locally."))
                  .catch((error) => warning("Save failed", String(error)));
              }}
            >
              Save Draft
            </Button>
            <Button
              variant="outline"
              className="rounded-sm border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"
              disabled={
                isSaving ||
                !strategyBuilderEnabled ||
                Boolean(simulation && !simulation.valid)
              }
              onClick={() => {
                void activateStrategy()
                  .then(() =>
                    success(
                      "Strategy activated",
                      "Compiled strategy is now scheduled by the automation engine.",
                    ),
                  )
                  .catch((error) => warning("Activation failed", String(error)));
              }}
            >
              Activate
            </Button>
          </div>
        </div>
        <label className="mt-4 grid gap-2 text-sm text-muted">
          Summary
          <textarea
            value={draft.summary ?? ""}
            onChange={(event) => updateDraftMeta({ summary: event.currentTarget.value })}
            rows={3}
            className="rounded-sm border border-border bg-secondary px-3 py-2 text-foreground outline-none"
          />
        </label>
        {!strategyBuilderEnabled ? (
          <p className="mt-4 text-sm text-muted">
            Strategy compile and save commands are available in the Tauri desktop
            runtime. The builder still renders here for local development and tests.
          </p>
        ) : null}
      </section>

      {isLoading ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
          <Skeleton className="h-[420px] w-full" />
          <Skeleton className="h-[420px] w-full" />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)]">
          <div className="space-y-6">
            <StrategyCanvas
              draft={draft}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onUpdateNodePositions={updateNodePositions}
              onAddCondition={addCondition}
              onResetTemplate={setTemplate}
              onRemoveSelected={removeSelectedNode}
            />
            <StrategySimulationPanel
              simulation={simulation}
              isCompiling={isCompiling}
            />
          </div>

          <div className="space-y-6">
            <StrategyInspector
              node={selectedNode}
              onUpdate={(data) => {
                if (!selectedNode) return;
                updateNodeData(selectedNode.id, data);
              }}
            />
            <GuardrailsForm
              guardrails={draft.guardrails}
              onChange={updateGuardrails}
              isSaving={isSaving}
              onSave={() => {
                void saveDraft()
                  .then(() => success("Strategy saved", "Guardrails persisted with the draft."))
                  .catch((error) => warning("Save failed", String(error)));
              }}
              onTestSimulation={() =>
                info(
                  simulation?.valid ? "Validation passed" : "Validation updated",
                  simulation?.message ??
                    "Compile preview refreshed with the latest draft state.",
                )
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
