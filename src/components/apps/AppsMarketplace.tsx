import { useMemo, useState } from "react";
import { Search, Puzzle, LayoutGrid, Package } from "lucide-react";

import { AppCard } from "./AppCard";
import { AppDetailModal } from "./AppDetailModal";
import { AppSettingsPanel } from "./AppSettingsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { useAppsMarketplace, useAppsMutations } from "@/hooks/useApps";
import type { ShadowApp } from "@/types/apps";

const CATEGORY_FILTERS = [
  { label: "All", value: "all" },
  { label: "Installed", value: "installed" },
  { label: "Available", value: "available" },
] as const;

export function AppsMarketplace() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORY_FILTERS)[number]["value"]>("all");
  const [detailApp, setDetailApp] = useState<ShadowApp | null>(null);
  const [settingsApp, setSettingsApp] = useState<ShadowApp | null>(null);

  const { data: apps = [], isLoading, isError } = useAppsMarketplace();
  const { install, setEnabled, refreshHealth } = useAppsMutations();

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      const searchMatches =
        app.name.toLowerCase().includes(search.toLowerCase()) ||
        app.shortDescription.toLowerCase().includes(search.toLowerCase());

      const categoryMatches =
        category === "all" ||
        (category === "installed" && app.isInstalled) ||
        (category === "available" && !app.isInstalled);

      return searchMatches && categoryMatches;
    });
  }, [apps, search, category]);

  const installedApps = filteredApps.filter((app) => app.isInstalled);
  const availableApps = filteredApps.filter((app) => !app.isInstalled);

  const handleDisable = (app: ShadowApp) => {
    void setEnabled.mutateAsync({ appId: app.id, enabled: false });
  };

  const handleEnable = (app: ShadowApp) => {
    void setEnabled.mutateAsync({ appId: app.id, enabled: true });
  };

  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-sm p-5 sm:p-6">
        <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
          Apps
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-foreground">
          Verified first-party integrations.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">
          SHADOW ships bundled protocol connectors (Lit, Flow, Filecoin backup). Install
          to enable agent tools and scheduler jobs — no third-party marketplace listings.
        </p>

        <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {CATEGORY_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setCategory(filter.value)}
                className={cn(
                  "rounded-sm border px-3 py-1.5 text-xs font-semibold tracking-[0.18em] uppercase transition-all active:scale-95",
                  category === filter.value
                    ? "border-primary/30 bg-primary/12 text-primary"
                    : "border-border bg-secondary text-muted hover:bg-surface-elevated",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end lg:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-sm text-[10px] font-mono uppercase tracking-wider"
              disabled={refreshHealth.isPending}
              onClick={() => void refreshHealth.mutateAsync()}
            >
              Sync integration health
            </Button>
            <div className="relative w-full lg:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
              <Input
                placeholder="Search integrations..."
                className="pl-10 bg-secondary border-border h-10 w-full rounded-sm text-sm focus:ring-primary/20"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      {isLoading && (
        <p className="text-sm text-muted font-mono">Loading integrations…</p>
      )}
      {isError && (
        <p className="text-sm text-red-400 font-mono">Could not load apps from backend.</p>
      )}

      <div className="space-y-8">
        {installedApps.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <LayoutGrid className="size-4 text-primary" />
              <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
                Installed ({installedApps.length})
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {installedApps.map((app) => (
                <AppCard
                  key={app.id}
                  app={app}
                  onInstall={() => {}}
                  onConfigure={setSettingsApp}
                  onDisable={handleDisable}
                  onEnable={handleEnable}
                />
              ))}
            </div>
          </div>
        )}

        {availableApps.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Package className="size-4 text-primary" />
              <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">
                Available
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {availableApps.map((app) => (
                <AppCard
                  key={app.id}
                  app={app}
                  onInstall={setDetailApp}
                  onConfigure={() => {}}
                  onDisable={() => {}}
                  onEnable={() => {}}
                />
              ))}
            </div>
          </div>
        )}

        {!isLoading && filteredApps.length === 0 && (
          <EmptyState
            icon={<Puzzle className="size-5" />}
            title="No integrations found"
            description={
              search
                ? `No matches for "${search}" in the selected category.`
                : "Try changing filters."
            }
          />
        )}
      </div>

      <AppDetailModal
        app={detailApp}
        open={!!detailApp}
        onOpenChange={(open) => !open && setDetailApp(null)}
        onInstall={async (app, acknowledgePermissions) => {
          await install.mutateAsync({ appId: app.id, acknowledgePermissions });
          setDetailApp(null);
        }}
        isInstalling={install.isPending}
      />

      <AppSettingsPanel
        app={settingsApp}
        open={!!settingsApp}
        onOpenChange={(open) => !open && setSettingsApp(null)}
      />
    </div>
  );
}
