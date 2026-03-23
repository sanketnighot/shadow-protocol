import { useEffect, useState } from "react";
import { Save, Brain, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import {
  getAgentSoul,
  updateAgentSoul,
  getAgentMemory,
  addAgentMemory,
  removeAgentMemory,
} from "@/lib/agent";
import type { AgentSoul, AgentMemoryItem } from "@/types/agent";

export function AgentGovernance() {
  const { success, warning } = useToast();
  
  const [soul, setSoul] = useState<AgentSoul | null>(null);
  const [memories, setMemories] = useState<AgentMemoryItem[]>([]);
  
  const [isSavingSoul, setIsSavingSoul] = useState(false);
  const [newMemoryFact, setNewMemoryFact] = useState("");
  const [isAddingMemory, setIsAddingMemory] = useState(false);

  useEffect(() => {
    void fetchState();
  }, []);

  const fetchState = async () => {
    try {
      const [s, m] = await Promise.all([getAgentSoul(), getAgentMemory()]);
      setSoul(s);
      setMemories(m.facts);
    } catch (err) {
      console.error("Failed to fetch agent state:", err);
    }
  };

  const handleSaveSoul = async () => {
    if (!soul) return;
    setIsSavingSoul(true);
    try {
      await updateAgentSoul(soul);
      success("Soul Updated", "Agent's persona and risk appetite saved.");
    } catch (err) {
      warning("Failed to save soul", String(err));
    } finally {
      setIsSavingSoul(false);
    }
  };

  const handleAddMemory = async () => {
    if (!newMemoryFact.trim()) return;
    setIsAddingMemory(true);
    try {
      const item = await addAgentMemory(newMemoryFact.trim());
      setMemories((prev) => [...prev, item]);
      setNewMemoryFact("");
      success("Memory Added", "The agent will now remember this fact.");
    } catch (err) {
      warning("Failed to add memory", String(err));
    } finally {
      setIsAddingMemory(false);
    }
  };

  const handleRemoveMemory = async (id: string) => {
    try {
      await removeAgentMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      success("Memory Removed", "The agent has forgotten this fact.");
    } catch (err) {
      warning("Failed to remove memory", String(err));
    }
  };

  if (!soul) return null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <section className="glass-panel rounded-sm p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <Brain className="size-6 text-primary" />
          <h2 className="text-xl font-semibold text-foreground">Agent Soul (Persona)</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">
          Define the core identity, risk appetite, and behavioral guidelines of your Shadow AI.
        </p>

        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Risk Appetite</label>
            <select
              value={soul.risk_appetite}
              onChange={(e) => setSoul({ ...soul, risk_appetite: e.target.value })}
              className="w-full rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
            >
              <option value="Conservative">Conservative</option>
              <option value="Moderate">Moderate</option>
              <option value="Aggressive">Aggressive</option>
              <option value="Degen">Degen</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Base Persona</label>
            <textarea
              value={soul.persona}
              onChange={(e) => setSoul({ ...soul, persona: e.target.value })}
              className="w-full min-h-[100px] rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              placeholder="You are a helpful DeFi assistant..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Preferred Chains (comma separated)</label>
            <input
              type="text"
              value={soul.preferred_chains.join(", ")}
              onChange={(e) => setSoul({ ...soul, preferred_chains: e.target.value.split(",").map(s => s.trim()) })}
              className="w-full rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              placeholder="Base, Ethereum"
            />
          </div>

          <Button
            size="sm"
            className="rounded-sm"
            onClick={handleSaveSoul}
            disabled={isSavingSoul}
          >
            <Save className="mr-2 size-4" />
            {isSavingSoul ? "Saving..." : "Save Soul"}
          </Button>
        </div>
      </section>

      <section className="glass-panel rounded-sm p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-foreground">Agent Memory</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Facts the agent has learned about you. You can manually add or delete memories to control context.
        </p>

        <div className="mt-6 space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newMemoryFact}
              onChange={(e) => setNewMemoryFact(e.target.value)}
              placeholder="e.g., I prefer holding ETH over stablecoins"
              className="flex-1 rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddMemory();
              }}
            />
            <Button
              size="sm"
              className="rounded-sm"
              onClick={handleAddMemory}
              disabled={isAddingMemory || !newMemoryFact.trim()}
            >
              <Plus className="mr-2 size-4" />
              Add
            </Button>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
            {memories.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">No memories stored yet.</p>
            ) : (
              memories.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-sm border border-border bg-secondary p-3">
                  <p className="text-sm text-foreground">{m.fact}</p>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-400 hover:bg-red-500/10 shrink-0"
                    onClick={() => handleRemoveMemory(m.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
