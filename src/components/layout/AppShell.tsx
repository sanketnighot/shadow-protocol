import { MainContent } from "@/components/layout/MainContent";
import { Sidebar } from "@/components/layout/Sidebar";
import { TitleBar } from "@/components/layout/TitleBar";

export function AppShell() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-5 py-5 text-foreground lg:px-8 lg:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_24%),radial-gradient(circle_at_70%_0%,rgba(139,92,246,0.18),transparent_30%)]" />
      <div className="relative mx-auto flex max-w-[1600px] flex-col gap-5">
        <TitleBar />
        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Sidebar />
          <MainContent />
        </div>
      </div>
    </div>
  );
}
