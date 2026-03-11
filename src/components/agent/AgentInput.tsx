import { CornerDownLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AgentInput() {
  return (
    <form className="glass-panel flex items-center gap-3 rounded-[26px] border-white/10 p-3">
      <Input
        aria-label="Agent instruction"
        placeholder="Type your instruction..."
        className="h-12 rounded-2xl border-white/10 bg-white/5 text-foreground placeholder:text-muted"
      />
      <Button type="submit" size="icon" className="size-12 rounded-2xl">
        <CornerDownLeft className="size-4" />
      </Button>
    </form>
  );
}
