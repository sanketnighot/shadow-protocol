import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, Waves, HardDrive, Globe, Lock, ScanFace, Check, ArrowLeft, Sparkles, ShieldCheck } from "lucide-react";
import { ShadowApp } from "@/data/apps";

const ICON_MAP: Record<string, React.ElementType> = {
  Zap,
  Waves,
  HardDrive,
  Globe,
  Lock,
  ScanFace,
};

type AppDetailModalProps = {
  app: ShadowApp | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (app: ShadowApp) => void;
};

export function AppDetailModal({ app, open, onOpenChange, onInstall }: AppDetailModalProps) {
  const [isInstalling, setIsInstalling] = useState(false);

  if (!app) return null;

  const Icon = ICON_MAP[app.icon] || Zap;

  const handleInstall = () => {
    setIsInstalling(true);
    setTimeout(() => {
      setIsInstalling(false);
      onInstall(app);
      onOpenChange(false);
    }, 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-background border-border text-foreground p-0 overflow-hidden gap-0 rounded-sm">
        <div className="flex items-center gap-2 p-4 border-b border-border bg-secondary">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted hover:text-foreground rounded-sm" onClick={() => onOpenChange(false)}>
            <ArrowLeft className="size-4" />
          </Button>
          <span className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">Back to Apps</span>
        </div>

        <div className="p-6 sm:p-8 overflow-y-auto max-h-[80vh] custom-scrollbar">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="flex size-20 shrink-0 items-center justify-center rounded-sm border border-primary/20 bg-primary/12 text-primary">
              <Icon className="size-10" />
            </div>
            <div className="flex-1 space-y-3">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">{app.name}</h2>
              <p className="text-lg text-muted">{app.shortDescription}</p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <div className="rounded-sm border border-border bg-secondary px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase text-muted">
                  By {app.author}
                </div>
                {app.rating && (
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <span className="text-yellow-500">★</span>
                    {app.rating}
                  </div>
                )}
                {app.installCount && (
                   <div className="text-xs text-muted font-mono uppercase tracking-wider">
                    {app.installCount} Installs
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-10 space-y-8">
            <div className="relative w-full aspect-video rounded-sm bg-secondary border border-border overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-50" />
              <div className="relative flex flex-col items-center text-muted gap-3">
                <Icon className="size-16 opacity-10" />
                <p className="font-mono text-[10px] tracking-[0.24em] uppercase opacity-40">Extension Preview</p>
              </div>
            </div>

            <div>
              <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase mb-3">Overview</p>
              <p className="text-sm leading-7 text-muted">{app.longDescription}</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="size-4 text-primary" />
                  <p className="font-mono text-[11px] tracking-[0.24em] text-muted uppercase">Key Features</p>
                </div>
                <ul className="space-y-3">
                  {app.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-muted">
                      <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-sm border border-orange-400/10 bg-orange-400/5 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldCheck className="size-4 text-orange-400" />
                  <p className="font-mono text-[11px] tracking-[0.18em] text-orange-400 uppercase">Permissions</p>
                </div>
                <ul className="space-y-2">
                  {app.permissions.map((perm, i) => (
                    <li key={i} className="flex items-center gap-3 text-xs text-orange-200/60">
                      <div className="size-1 rounded-full bg-orange-500/40" />
                      {perm}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-border bg-secondary">
          <Button
            className="w-full h-12 rounded-sm text-xs font-semibold tracking-[0.18em] uppercase active:scale-[0.98] transition-all"
            onClick={handleInstall}
            disabled={isInstalling}
          >
            {isInstalling ? "Downloading dependencies..." : "Install Extension"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
