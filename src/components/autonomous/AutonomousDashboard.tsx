import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskQueue } from "./TaskQueue";
import { GuardrailsPanel } from "./GuardrailsPanel";
import { HealthDashboard } from "./HealthDashboard";
import { OpportunityFeed } from "./OpportunityFeed";
import { OrchestratorControl } from "./OrchestratorControl";
import { ListChecks, Shield, Activity, Sparkles, Cpu } from "lucide-react";

export function AutonomousDashboard() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Autonomous Agent</h1>
        <p className="text-sm text-muted mt-1">
          Proactive portfolio management with AI-driven insights and safety guardrails
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main Content */}
        <Tabs defaultValue="tasks" className="w-full">
          <TabsList className="mb-4 h-auto flex-wrap gap-1 bg-transparent p-0">
            <TabsTrigger
              value="tasks"
              className="gap-1.5 rounded-sm border border-white/5 bg-white/5 data-[state=active]:bg-primary/20 data-[state=active]:border-primary/30"
            >
              <ListChecks className="size-3.5" />
              <span className="hidden sm:inline">Tasks</span>
            </TabsTrigger>
            <TabsTrigger
              value="health"
              className="gap-1.5 rounded-sm border border-white/5 bg-white/5 data-[state=active]:bg-primary/20 data-[state=active]:border-primary/30"
            >
              <Activity className="size-3.5" />
              <span className="hidden sm:inline">Health</span>
            </TabsTrigger>
            <TabsTrigger
              value="opportunities"
              className="gap-1.5 rounded-sm border border-white/5 bg-white/5 data-[state=active]:bg-primary/20 data-[state=active]:border-primary/30"
            >
              <Sparkles className="size-3.5" />
              <span className="hidden sm:inline">Opportunities</span>
            </TabsTrigger>
            <TabsTrigger
              value="guardrails"
              className="gap-1.5 rounded-sm border border-white/5 bg-white/5 data-[state=active]:bg-primary/20 data-[state=active]:border-primary/30"
            >
              <Shield className="size-3.5" />
              <span className="hidden sm:inline">Guardrails</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="mt-0">
            <TaskQueue />
          </TabsContent>

          <TabsContent value="health" className="mt-0">
            <HealthDashboard />
          </TabsContent>

          <TabsContent value="opportunities" className="mt-0">
            <OpportunityFeed />
          </TabsContent>

          <TabsContent value="guardrails" className="mt-0">
            <GuardrailsPanel />
          </TabsContent>
        </Tabs>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="glass-panel rounded-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="size-4 text-primary" />
              <h3 className="text-sm font-medium text-foreground">Control</h3>
            </div>
            <OrchestratorControl />
          </div>
        </div>
      </div>
    </div>
  );
}
