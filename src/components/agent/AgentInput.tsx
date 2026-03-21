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
      className="relative overflow-hidden rounded-sm border border-border bg-surface-elevated p-1.5 backdrop-blur-xl transition-all focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/40"
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
            placeholder="Type command..."
            disabled={disabled}
            className="font-mono h-12 w-full bg-transparent px-2 text-sm text-foreground placeholder:text-muted/60 focus:outline-none disabled:opacity-50"
          />
        </div>
        <Button
          type="submit"
          size="icon-lg"
          disabled={disabled || value.trim().length === 0}
          className="size-10 rounded-sm bg-primary text-primary-foreground shadow-none transition-transform hover:bg-primary/90 disabled:opacity-50"
        >
          <ArrowUpRight className="size-5" />
        </Button>
      </div>
    </form>
  );
}
