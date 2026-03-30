import { motion } from "framer-motion";
import { ChevronRight, ChevronLeft, Plus, X } from "lucide-react";
import { useState } from "react";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { EXPERIENCE_LEVELS, INVESTMENT_GOALS } from "@/constants/personaArchetypes";
import { Button } from "@/components/ui/button";

export function Step5MemorySeeds() {
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const prevStep = useOnboardingStore((s) => s.prevStep);
  const agentConfig = useOnboardingStore((s) => s.agentConfig);
  const setAgentConfig = useOnboardingStore((s) => s.setAgentConfig);
  const isReplay = useOnboardingStore((s) => s.isReplay);

  const [experienceLevel, setExperienceLevel] = useState(
    agentConfig?.experienceLevel || ""
  );
  const [selectedGoals, setSelectedGoals] = useState<string[]>(
    agentConfig?.goals || []
  );
  const [customRules, setCustomRules] = useState<string[]>(
    agentConfig?.constraints?.custom || []
  );
  const [newRule, setNewRule] = useState("");

  const handleGoalToggle = (goalId: string) => {
    setSelectedGoals((prev) =>
      prev.includes(goalId)
        ? prev.filter((g) => g !== goalId)
        : [...prev, goalId]
    );
  };

  const handleAddRule = () => {
    if (newRule.trim()) {
      setCustomRules((prev) => [...prev, newRule.trim()]);
      setNewRule("");
    }
  };

  const handleRemoveRule = (index: number) => {
    setCustomRules((prev) => prev.filter((_, i) => i !== index));
  };

  const handleContinue = () => {
    setAgentConfig({
      ...(agentConfig || {
        persona: "",
        personaText: "",
        riskAppetite: "Moderate",
        preferredChains: ["Ethereum", "Base"],
        experienceLevel: "active",
        goals: [],
        constraints: {
          avoidUnaudited: false,
          noLeverage: false,
          maxTxAmount: null,
          custom: [],
        },
      }),
      experienceLevel,
      goals: selectedGoals,
      constraints: {
        ...(agentConfig?.constraints || {
          avoidUnaudited: false,
          noLeverage: false,
          maxTxAmount: null,
        }),
        custom: customRules,
      },
    });
    nextStep();
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center overflow-y-auto px-4 py-4">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-6 text-center"
      >
        <h2 className="font-mono text-xs tracking-[0.2em] text-muted uppercase">
          Preferences
        </h2>
        <p className="mt-2 max-w-md text-sm text-muted">
          Help your Shadow understand you. All optional.
        </p>
      </motion.div>

      <div className="w-full max-w-xl space-y-6">
        {/* Experience Level */}
        <section>
          <h3 className="mb-3 text-sm font-medium text-foreground">
            Experience level
          </h3>
          <div className="grid gap-2 grid-cols-3">
            {EXPERIENCE_LEVELS.map((level) => (
              <button
                key={level.id}
                onClick={() => setExperienceLevel(level.id)}
                className={`flex items-center gap-2 rounded-sm border p-3 text-left transition-all ${
                  experienceLevel === level.id
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-secondary hover:border-primary/30"
                }`}
              >
                <span className="text-lg">{level.icon}</span>
                <p className="text-sm text-foreground">{level.name}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Investment Goals */}
        <section>
          <h3 className="mb-3 text-sm font-medium text-foreground">
            Goals <span className="font-normal text-muted">(optional)</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {INVESTMENT_GOALS.map((goal) => (
              <button
                key={goal.id}
                onClick={() => handleGoalToggle(goal.id)}
                className={`flex items-center gap-2 rounded-sm border px-3 py-2 text-sm transition-all ${
                  selectedGoals.includes(goal.id)
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border bg-secondary text-muted hover:border-primary/30"
                }`}
              >
                <span>{goal.icon}</span>
                {goal.name}
              </button>
            ))}
          </div>
        </section>

        {/* Custom Rules */}
        <section>
          <h3 className="mb-3 text-sm font-medium text-foreground">
            Notes for your Shadow <span className="font-normal text-muted">(optional)</span>
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRule()}
              placeholder="e.g., Prefer ETH over stables"
              className="flex-1 rounded-sm border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
            />
            <Button
              size="sm"
              variant="outline"
              className="rounded-sm"
              onClick={handleAddRule}
              disabled={!newRule.trim()}
            >
              <Plus className="size-4" />
            </Button>
          </div>

          {customRules.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {customRules.map((rule, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 rounded-sm border border-border bg-secondary px-2 py-1 text-xs text-foreground"
                >
                  {rule}
                  <button
                    onClick={() => handleRemoveRule(index)}
                    className="text-muted hover:text-red-400"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={prevStep}
          className="flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back
        </button>

        <button
          onClick={handleContinue}
          className="group flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90"
        >
          {isReplay ? "Save" : "Continue"}
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </div>
  );
}
