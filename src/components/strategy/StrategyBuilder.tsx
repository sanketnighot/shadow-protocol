import { ArrowLeft, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { FlowSchedulePanel } from "@/components/strategy/FlowSchedulePanel";
import { GuardrailsForm } from "@/components/strategy/GuardrailsForm";
import { StrategyCanvas } from "@/components/strategy/StrategyCanvas";
import { StrategyInspector } from "@/components/strategy/StrategyInspector";
import {
  StrategySimulationDetail,
  StrategySimulationStrip,
} from "@/components/strategy/StrategySimulationPanel";
import { Skeleton } from "@/components/shared/Skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStrategyBuilder } from "@/hooks/useStrategyBuilder";
import { useToast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { StrategyValidationIssue } from "@/types/strategy";
import {
  applyIssueNavigation,
  type StrategyRailTab,
  validationIssuesForInspector,
} from "@/lib/strategyValidationUx";

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
  const { success, warning } = useToast();

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [railTab, setRailTab] = useState<StrategyRailTab>("step");

  const validationErrors = simulation?.plan?.validationErrors;
  const errCount = validationErrors?.length ?? 0;
  const valid = Boolean(simulation?.valid);

  const inspectorIssues = useMemo(
    () => validationIssuesForInspector(validationErrors, selectedNodeId),
    [validationErrors, selectedNodeId],
  );

  const safetyIssueMessages = useMemo(
    () =>
      validationErrors
        ?.filter((e) => (e.fieldPath ?? "").startsWith("guardrails"))
        .map((e) => e.message) ?? [],
    [validationErrors],
  );

  const handleSelectIssue = (issue: StrategyValidationIssue) => {
    applyIssueNavigation(issue, setRailTab, setSelectedNodeId);
  };

  return (
    <div className="space-y-4">
      {/* Compact header */}
      <div className="glass-panel rounded-sm px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            <Link
              to="/automation"
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Automation
            </Link>
            <span className="hidden text-border sm:inline" aria-hidden>
              |
            </span>
            <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
              Strategy builder
            </h1>
            <span
              className={cn(
                "shrink-0 rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase",
                isCompiling
                  ? "border-white/10 bg-white/5 text-muted"
                  : valid
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : errCount > 0
                      ? "border-red-500/30 bg-red-500/10 text-red-200"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-100",
              )}
            >
              {isCompiling ? "Compile…" : valid ? "Valid" : errCount > 0 ? `${errCount} err` : "Review"}
            </span>
            <span className="truncate text-xs text-muted">
              {draft.template.replace(/_/g, " ")} · {persistedStatus} · failures {failureCount}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="rounded-sm"
              disabled={isSaving || !strategyBuilderEnabled}
              onClick={() => {
                void saveDraft()
                  .then(() => success("Strategy saved", "Draft persisted locally."))
                  .catch((error) => warning("Save failed", String(error)));
              }}
            >
              Save draft
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-sm border-primary/25 bg-primary/5 text-primary hover:bg-primary/10"
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
                      "Compiled strategy is scheduled by the automation engine.",
                    ),
                  )
                  .catch((error) => warning("Activation failed", String(error)));
              }}
            >
              Activate
            </Button>
          </div>
        </div>
        {!strategyBuilderEnabled ? (
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
            Compile and save require the Tauri desktop app. UI is still usable for layout in dev.
          </p>
        ) : null}
      </div>

      {/* Collapsible strategy details */}
      <div className="glass-panel rounded-sm">
        <button
          type="button"
          onClick={() => setDetailsOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left sm:px-5"
          aria-expanded={detailsOpen}
        >
          <span className="text-sm font-medium text-foreground">Strategy details</span>
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted transition-transform", detailsOpen && "rotate-180")}
            aria-hidden
          />
        </button>
        {detailsOpen ? (
          <div className="space-y-4 border-t border-border px-4 pb-4 pt-3 sm:px-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs text-muted">
                Name
                <input
                  value={draft.name}
                  onChange={(event) => updateDraftMeta({ name: event.currentTarget.value })}
                  className="rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none"
                />
              </label>
              <label className="grid gap-1.5 text-xs text-muted">
                Mode
                <select
                  value={draft.mode}
                  onChange={(event) =>
                    updateDraftMeta({
                      mode: event.currentTarget.value as typeof draft.mode,
                    })
                  }
                  className="rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none"
                >
                  <option value="monitor_only">Monitor only</option>
                  <option value="approval_required">Approval required</option>
                  <option value="pre_authorized">Pre-authorized</option>
                </select>
              </label>
            </div>
            <label className="grid gap-1.5 text-xs text-muted">
              Summary
              <textarea
                value={draft.summary ?? ""}
                onChange={(event) => updateDraftMeta({ summary: event.currentTarget.value })}
                rows={2}
                className="rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none"
              />
            </label>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <Skeleton className="min-h-[min(520px,70vh)] flex-1 rounded-sm" />
          <Skeleton className="h-112 w-full shrink-0 rounded-sm xl:w-[min(100%,380px)]" />
        </div>
      ) : (
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1 space-y-0">
            <StrategyCanvas
              draft={draft}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onUpdateNodePositions={updateNodePositions}
              onAddCondition={addCondition}
              onResetTemplate={setTemplate}
              onRemoveSelected={removeSelectedNode}
            />
            <StrategySimulationStrip
              simulation={simulation}
              isCompiling={isCompiling}
              onOpenPreview={() => setRailTab("preview")}
            />
          </div>

          <div className="glass-panel w-full shrink-0 rounded-sm p-4 xl:sticky xl:top-4 xl:w-[min(100%,380px)] xl:self-start">
            <Tabs
              value={railTab}
              onValueChange={(v) => setRailTab(v as StrategyRailTab)}
              className="w-full"
            >
              <TabsList className="mb-3 h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
                <TabsTrigger value="step" className="rounded-sm px-3 text-xs">
                  Step
                </TabsTrigger>
                <TabsTrigger value="safety" className="rounded-sm px-3 text-xs">
                  Safety
                </TabsTrigger>
                <TabsTrigger value="preview" className="rounded-sm px-3 text-xs">
                  Preview
                </TabsTrigger>
                <TabsTrigger value="flow" className="rounded-sm px-3 text-xs">
                  Flow
                </TabsTrigger>
              </TabsList>
              <TabsContent value="step" className="mt-0 min-h-48">
                <StrategyInspector
                  node={selectedNode}
                  validationIssues={inspectorIssues}
                  onUpdate={(data) => {
                    if (!selectedNode) return;
                    updateNodeData(selectedNode.id, data);
                  }}
                />
              </TabsContent>
              <TabsContent value="safety" className="mt-0 min-h-48">
                <GuardrailsForm
                  guardrails={draft.guardrails}
                  onChange={updateGuardrails}
                  safetyIssues={safetyIssueMessages}
                />
              </TabsContent>
              <TabsContent value="preview" className="mt-0 min-h-48">
                <p className="mb-3 font-mono text-[10px] tracking-[0.2em] text-muted uppercase">
                  Compile output
                </p>
                <StrategySimulationDetail
                  simulation={simulation}
                  isCompiling={isCompiling}
                  onSelectIssue={handleSelectIssue}
                />
              </TabsContent>
              <TabsContent value="flow" className="mt-0 min-h-48">
                <p className="mb-3 font-mono text-[10px] tracking-[0.2em] text-muted uppercase">
                  Flow schedule
                </p>
                <FlowSchedulePanel strategyBuilderEnabled={strategyBuilderEnabled} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
}
