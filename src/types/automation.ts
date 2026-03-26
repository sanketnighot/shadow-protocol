export type AutomationStrategyMode =
  | "monitor_only"
  | "approval_required"
  | "pre_authorized";

export type AutomationStrategy = {
  id: string;
  name: string;
  summary?: string | null;
  status: string;
  mode: AutomationStrategyMode;
  trigger: unknown;
  action: unknown;
  guardrails: unknown;
  approvalPolicy: unknown;
  executionPolicy: unknown;
  lastEvaluationAt?: number | null;
  lastExecutionAt?: number | null;
  nextRunAt?: number | null;
  failureCount: number;
  disabledReason?: string | null;
};
