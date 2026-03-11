import { useState } from "react";
import { CornerDownLeft } from "lucide-react";

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
      className="glass-panel flex flex-col gap-3 rounded-[24px] border-white/10 p-3 sm:flex-row sm:items-center sm:rounded-[26px]"
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
      <Input
        aria-label="Agent instruction"
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        placeholder="Type your instruction..."
        disabled={disabled}
        className="h-12 w-full rounded-2xl border-white/10 bg-white/5 text-foreground placeholder:text-muted"
      />
      <Button
        type="submit"
        size="icon"
        disabled={disabled || value.trim().length === 0}
        className="size-12 self-end rounded-2xl sm:self-auto"
      >
        <CornerDownLeft className="size-4" />
      </Button>
    </form>
  );
}
