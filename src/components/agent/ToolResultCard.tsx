import { Database } from "lucide-react";

type ToolResultCardProps = {
  toolName: string;
  content: string;
};

export function ToolResultCard({ toolName, content }: ToolResultCardProps) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = content;
  }

  const display =
    typeof parsed === "string"
      ? parsed
      : typeof parsed === "object" && parsed !== null
        ? JSON.stringify(parsed, null, 2)
        : String(parsed);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <Database className="size-3.5 text-primary/80" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {toolName}
        </span>
      </div>
      <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs text-foreground/85">
        {display}
      </pre>
    </div>
  );
}
