import { CornerDownLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AgentInput() {
  return (
    <form className="glass-panel flex flex-col gap-3 rounded-[24px] border-white/10 p-3 sm:flex-row sm:items-center sm:rounded-[26px]">
      <Input
        aria-label="Agent instruction"
        placeholder="Type your instruction..."
        className="h-12 w-full rounded-2xl border-white/10 bg-white/5 text-foreground placeholder:text-muted"
      />
      <Button type="submit" size="icon" className="size-12 self-end rounded-2xl sm:self-auto">
        <CornerDownLeft className="size-4" />
      </Button>
    </form>
  );
}
