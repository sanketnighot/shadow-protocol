import packageJson from "../../../package.json";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_ABOUT } from "@/data/about";

type AboutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-background/95 backdrop-blur">
        <DialogTitle className="sr-only">About {APP_ABOUT.name}</DialogTitle>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/12 text-2xl font-black tracking-wider text-primary">
              S
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {APP_ABOUT.name}
              </h2>
              <p className="text-sm text-muted">{APP_ABOUT.tagline}</p>
            </div>
          </div>
          <p className="text-sm leading-6 text-foreground">
            {APP_ABOUT.description}
          </p>
          <dl className="grid gap-2 border-t border-white/10 pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Version</dt>
              <dd className="font-medium text-foreground">
                v{packageJson.version}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Identifier</dt>
              <dd className="font-mono text-xs text-foreground">
                {APP_ABOUT.identifier}
              </dd>
            </div>
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}
