import { Bell, MoonStar, Search, Settings2 } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function TitleBar() {
  return (
    <header className="glass-panel flex items-center justify-between rounded-sm border-white/10 px-4 py-3 sm:px-5 sm:py-4 lg:rounded-[30px] lg:px-6">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-primary/20 bg-primary/12 text-lg font-black tracking-[0.24em] text-primary sm:size-12">
          S
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
            SHADOW Protocol
          </p>
          <p className="mt-1 hidden truncate text-sm text-muted sm:block">
            Private DeFi workstation
          </p>
        </div>
      </div>

      <div className="hidden items-center gap-3 lg:flex">
        <div className="flex items-center gap-2 rounded-sm border border-white/10 bg-white/5 px-4 py-2 text-sm text-muted">
          <Search className="size-4" />
          Cmd+K
        </div>
        <Button variant="ghost" size="icon-sm" className="rounded-sm text-foreground hover:bg-white/10">
          <Settings2 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" className="rounded-sm text-foreground hover:bg-white/10">
          <Bell className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" className="rounded-sm text-foreground hover:bg-white/10">
          <MoonStar className="size-4" />
        </Button>
        <Avatar className="ring-1 ring-white/10">
          <AvatarFallback className="bg-primary/15 text-primary">SP</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
