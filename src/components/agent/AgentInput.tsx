import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";

type AgentInputProps = {
  disabled?: boolean;
  onSubmit: (content: string) => void;
};

export function AgentInput({ disabled = false, onSubmit }: AgentInputProps) {
  const [value, setValue] = useState("");

  return (
    <form
      className="relative overflow-hidden rounded-full border border-border bg-surface-elevated p-1.5 shadow-lg backdrop-blur-xl transition-all focus-within:border-primary/40 focus-within:shadow-[0_12px_48px_rgba(139,92,246,0.15)]"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmedValue = value.trim();

        if (trimmedValue.length === 0 || disabled) {
          return;
        }

        onSubmit(trimmedValue);
        setValue("");
      }}
    >
      <div className="relative flex items-center gap-2 px-2">
        <div className="min-w-0 flex-1">
          <input
            aria-label="Agent instruction"
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            placeholder="Type your instruction..."
            disabled={disabled}
            className="h-12 w-full bg-transparent px-2 text-base text-foreground placeholder:text-muted focus:outline-none disabled:opacity-50"
          />
        </div>
        <Button
          type="submit"
          size="icon-lg"
          disabled={disabled || value.trim().length === 0}
          className="size-10 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-105 hover:bg-primary/90 disabled:opacity-50 disabled:hover:scale-100"
        >
          <ArrowUpRight className="size-5" />
        </Button>
      </div>
    </form>
  );
}
