import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AgentInputProps = {
  disabled?: boolean;
  onSubmit: (content: string) => void;
};

export function AgentInput({ disabled = false, onSubmit }: AgentInputProps) {
  const [value, setValue] = useState("");

  return (
    <form
      className="relative overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(22,22,30,0.96),rgba(13,13,18,0.98))] p-2 shadow-[0_18px_48px_rgba(0,0,0,0.24)]"
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
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(139,92,246,0.08),transparent_30%,transparent)]" />
      <div className="relative flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input
            aria-label="Agent instruction"
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            placeholder="Type your instruction..."
            disabled={disabled}
            className="h-[52px] w-full rounded-[20px] border-white/8 bg-black/25 px-4 text-foreground placeholder:text-muted focus-visible:border-primary/30 focus-visible:ring-primary/15"
          />
        </div>
        <Button
          type="submit"
          size="icon-lg"
          disabled={disabled || value.trim().length === 0}
          className="mt-6 size-12 rounded-[20px] shadow-[0_14px_32px_rgba(139,92,246,0.35)]"
        >
          <ArrowUpRight className="size-4" />
        </Button>
      </div>
    </form>
  );
}
