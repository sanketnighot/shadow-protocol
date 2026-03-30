import { motion } from "framer-motion";
import { ChevronRight, ChevronLeft, Check, Plus, X } from "lucide-react";
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
  const existingMemories = useOnboardingStore((s) => s.existingMemories);

  const [experienceLevel, setExperienceLevel] = useState(
    agentConfig?.experienceLevel || ""
  );
  const [selectedGoals, setSelectedGoals] = useState<string[]>(
    agentConfig?.goals || []
  );
  const [avoidUnaudited, setAvoidUnaudited] = useState(
    agentConfig?.constraints?.avoidUnaudited || false
  );
  const [noLeverage, setNoLeverage] = useState(
    agentConfig?.constraints?.noLeverage || false
  );
  const [maxTxAmount, setMaxTxAmount] = useState<string>(
    agentConfig?.constraints?.maxTxAmount?.toString() || ""
  );
  const [customRules, setCustomRules] = useState<string[]>(
    agentConfig?.constraints?.custom || existingMemories || []
  );
  const [newRule, setNewRule] = useState("");

  const handleGoalToggle = (goalId: string) => {
    setSelectedGoals((prev) =>
      prev.includes(goalId) ? prev.filter((g) => g !== goalId) : [...prev, goalId]
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
        avoidUnaudited,
        noLeverage,
        maxTxAmount: maxTxAmount ? parseFloat(maxTxAmount) : null,
        custom: customRules,
      },
    });
    nextStep();
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center overflow-y-auto px-4 py-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-6 text-center"
      >
        <h2 className="font-mono text-xs tracking-[0.2em] text-muted uppercase">
          Memory Seeds
        </h2>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Help Your Shadow Understand You
        </h1>
        <p className="mt-2 max-w-lg text-sm text-muted">
          These facts help your agent give you better, more personalized advice.
        </p>
      </motion.div>

      <div className="w-full max-w-2xl space-y-6">
        {/* Experience Level */}
        <section>
          <h3 className="mb-3 text-sm font-medium text-foreground">
            What's your DeFi experience level?
          </h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {EXPERIENCE_LEVELS.map((level) => (
              <motion.button
                key={level.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setExperienceLevel(level.id)}
                className={`flex items-center gap-3 rounded-sm border p-3 text-left transition-all ${
                  experienceLevel === level.id
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-secondary hover:border-primary/30"
                }`}
              >
                <span className="text-xl">{level.icon}</span>
                <div>
                  <p className="text-sm font-medium text-foreground">{level.name}</p>
                  <p className="text-xs text-muted">{level.description}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Investment Goals */}
        <section>
          <h3 className="mb-3 text-sm font-medium text-foreground">
            What are your primary DeFi goals?{" "}
            <span className="font-normal text-muted">(select all that apply)</span>
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {INVESTMENT_GOALS.map((goal) => (
              <motion.button
                key={goal.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => handleGoalToggle(goal.id)}
                className={`flex items-center gap-3 rounded-sm border p-3 text-left transition-all ${
                  selectedGoals.includes(goal.id)
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-secondary hover:border-primary/30"
                }`}
              >
                <span className="text-lg">{goal.icon}</span>
                <p className="text-sm text-foreground">{goal.name}</p>
                <div
                  className={`ml-auto flex h-4 w-4 items-center justify-center rounded-sm border ${
                    selectedGoals.includes(goal.id)
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-background"
                  }`}
                >
                  {selectedGoals.includes(goal.id) && <Check className="size-2.5" />}
                </div>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Constraints */}
        <section>
          <h3 className="mb-3 text-sm font-medium text-foreground">
            Any specific rules I should follow?
          </h3>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-sm border border-border bg-secondary p-3 transition-all hover:border-primary/30">
              <input
                type="checkbox"
                checked={avoidUnaudited}
                onChange={(e) => setAvoidUnaudited(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary/50"
              />
              <span className="text-sm text-foreground">Avoid unaudited contracts</span>
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-sm border border-border bg-secondary p-3 transition-all hover:border-primary/30">
              <input
                type="checkbox"
                checked={noLeverage}
                onChange={(e) => setNoLeverage(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary/50"
              />
              <span className="text-sm text-foreground">No leverage or borrowing</span>
            </label>

            <div className="flex items-center gap-3 rounded-sm border border-border bg-secondary p-3">
              <label className="text-sm text-foreground whitespace-nowrap">
                Skip tx above $
              </label>
              <input
                type="number"
                value={maxTxAmount}
                onChange={(e) => setMaxTxAmount(e.target.value)}
                placeholder="No limit"
                className="flex-1 rounded-sm border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>
          </div>
        </section>

        {/* Custom Rules */}
        <section>
          <h3 className="mb-3 text-sm font-medium text-foreground">
            Anything else your Shadow should know?{" "}
            <span className="font-normal text-muted">(optional)</span>
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRule()}
              placeholder="e.g., I prefer holding ETH over stablecoins"
              className="flex-1 rounded-sm border border-border bg-secondary px-4 py-2.5 text-sm text-foreground focus:border-primary/50 focus:outline-none"
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
            <div className="mt-3 space-y-2">
              {customRules.map((rule, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between gap-2 rounded-sm border border-border bg-secondary px-3 py-2"
                >
                  <p className="text-sm text-foreground">{rule}</p>
                  <button
                    onClick={() => handleRemoveRule(index)}
                    className="text-muted transition-colors hover:text-red-400"
                  >
                    <X className="size-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="mt-8 flex w-full max-w-2xl items-center justify-between"
      >
        <button
          onClick={prevStep}
          className="flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back
        </button>

        <div className="flex items-center gap-4">
          {!isReplay && (
            <button
              onClick={handleContinue}
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              Skip for now
            </button>
          )}
          <button
            onClick={handleContinue}
            className="group flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90"
          >
            Continue
            <ChevronRight className="size-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
