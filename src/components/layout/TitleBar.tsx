import { Bell, MoonStar, Search, Settings2 } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function TitleBar() {
  return (
    <header className="glass-panel flex items-center justify-between rounded-[30px] border-white/10 px-6 py-4">
      <div className="flex items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/12 text-lg font-black tracking-[0.24em] text-primary">
          S
        </div>
        <div>
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
            SHADOW Protocol
          </p>
          <p className="mt-1 text-sm text-muted">Private DeFi workstation</p>
        </div>
      </div>

      <div className="hidden items-center gap-3 lg:flex">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-muted">
          <Search className="size-4" />
          Cmd+K
        </div>
        <Button variant="ghost" size="icon-sm" className="rounded-full text-foreground hover:bg-white/10">
          <Settings2 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" className="rounded-full text-foreground hover:bg-white/10">
          <Bell className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" className="rounded-full text-foreground hover:bg-white/10">
          <MoonStar className="size-4" />
        </Button>
        <Avatar className="ring-1 ring-white/10">
          <AvatarFallback className="bg-primary/15 text-primary">SP</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
