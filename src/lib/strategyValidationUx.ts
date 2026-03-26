import type { StrategyValidationIssue } from "@/types/strategy";

export type StrategyRailTab = "step" | "safety" | "preview";

/**
 * Maps backend `fieldPath` to inspector rail tab and optional node id (`nodes.{id}`).
 */
export function parseValidationFieldPath(
  fieldPath: string | undefined | null,
): { tab: StrategyRailTab; nodeId: string | null } {
  if (!fieldPath) {
    return { tab: "preview", nodeId: null };
  }
  if (fieldPath.startsWith("guardrails")) {
    return { tab: "safety", nodeId: null };
  }
  if (fieldPath === "name" || fieldPath === "summary" || fieldPath === "mode") {
    return { tab: "step", nodeId: null };
  }
  if (fieldPath.startsWith("nodes.")) {
    const rest = fieldPath.slice("nodes.".length);
    if (rest.length > 0 && !rest.includes(".")) {
      return { tab: "step", nodeId: rest };
    }
  }
  return { tab: "preview", nodeId: null };
}

export function applyIssueNavigation(
  issue: StrategyValidationIssue,
  setTab: (t: StrategyRailTab) => void,
  setNodeId: (id: string | null) => void,
): void {
  const { tab, nodeId } = parseValidationFieldPath(issue.fieldPath);
  setTab(tab);
  if (nodeId) {
    setNodeId(nodeId);
  }
}

/** Errors to surface in the Step inspector (selected node or whole-graph structure). */
export function validationIssuesForInspector(
  issues: StrategyValidationIssue[] | undefined,
  selectedNodeId: string | null,
): StrategyValidationIssue[] {
  if (!issues?.length) {
    return [];
  }
  return issues.filter((issue) => {
    const fp = issue.fieldPath ?? "";
    if (fp.startsWith("guardrails")) {
      return false;
    }
    if (fp === "name" || fp === "summary" || fp === "mode") {
      return true;
    }
    if (fp === "nodes" || fp === "edges") {
      return Boolean(selectedNodeId);
    }
    const { nodeId } = parseValidationFieldPath(fp);
    if (nodeId && selectedNodeId) {
      return nodeId === selectedNodeId;
    }
    return false;
  });
}
