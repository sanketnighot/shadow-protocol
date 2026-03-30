import { motion } from "framer-motion";
import { ChevronRight, ChevronLeft, Check } from "lucide-react";
import { useState } from "react";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { RISK_LEVELS, CHAINS } from "@/constants/personaArchetypes";

export function Step4RiskProfile() {
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const prevStep = useOnboardingStore((s) => s.prevStep);
  const agentConfig = useOnboardingStore((s) => s.agentConfig);
  const setAgentConfig = useOnboardingStore((s) => s.setAgentConfig);
  const isReplay = useOnboardingStore((s) => s.isReplay);

  const [selectedRisk, setSelectedRisk] = useState(
    agentConfig?.riskAppetite || "Moderate"
  );
  const [selectedChains, setSelectedChains] = useState<string[]>(
    agentConfig?.preferredChains || ["Ethereum", "Base"]
  );

  const handleRiskSelect = (riskId: string) => {
    setSelectedRisk(riskId);
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
      riskAppetite: riskId,
    });
  };

  const handleChainToggle = (chainId: string) => {
    const newChains = selectedChains.includes(chainId)
      ? selectedChains.filter((c) => c !== chainId)
      : [...selectedChains, chainId];
    setSelectedChains(newChains);
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
      preferredChains: newChains,
    });
  };

  const canProceed = selectedChains.length > 0;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-8 text-center"
      >
        <h2 className="font-mono text-xs tracking-[0.2em] text-muted uppercase">
          Operational Parameters
        </h2>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
          Set Your Risk & Chain Preferences
        </h1>
        <p className="mt-3 max-w-lg text-sm text-muted">
          These settings help your agent understand your comfort zone and where you operate.
        </p>
      </motion.div>

      <div className="w-full max-w-4xl space-y-8">
        {/* Risk Appetite */}
        <section>
          <h3 className="mb-4 text-sm font-medium text-foreground">
            1. How much risk are you comfortable with?
          </h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {RISK_LEVELS.map((risk) => (
              <motion.button
                key={risk.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleRiskSelect(risk.id)}
                className={`relative overflow-hidden rounded-sm border p-4 text-left transition-all ${
                  selectedRisk === risk.id
                    ? `${risk.borderColor} ${risk.bgColor} border-2`
                    : "border-border bg-secondary hover:border-primary/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{risk.icon}</span>
                  {selectedRisk === risk.id && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className={`flex h-5 w-5 items-center justify-center rounded-full ${risk.bgColor}`}
                    >
                      <Check className={`size-3 ${risk.color}`} />
                    </motion.div>
                  )}
                </div>
                <p className={`mt-2 text-sm font-semibold ${risk.color}`}>{risk.name}</p>
                <p className="mt-0.5 text-xs text-muted">{risk.tagline}</p>
                <p className="mt-1 text-xs text-muted">
                  Max tx: <span className="font-medium text-foreground">{risk.maxTx}</span>
                </p>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Chain Preferences */}
        <section>
          <h3 className="mb-4 text-sm font-medium text-foreground">
            2. Which chains do you want to operate on?
          </h3>
          <div className="grid gap-3 lg:grid-cols-3">
            {CHAINS.map((chain) => (
              <motion.button
                key={chain.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => handleChainToggle(chain.id)}
                className={`relative flex items-center gap-4 overflow-hidden rounded-sm border p-4 text-left transition-all ${
                  selectedChains.includes(chain.id)
                    ? `border-primary/50 bg-primary/10`
                    : "border-border bg-secondary hover:border-primary/30"
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-sm ${chain.bgColor} ${chain.color} text-lg font-bold`}>
                  {chain.icon}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">{chain.name}</p>
                  <p className="text-xs text-muted">{chain.tagline}</p>
                </div>
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                    selectedChains.includes(chain.id)
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-background"
                  }`}
                >
                  {selectedChains.includes(chain.id) && <Check className="size-3" />}
                </div>
              </motion.button>
            ))}
          </div>
          {selectedChains.length === 0 && (
            <p className="mt-2 text-xs text-amber-500">
              Select at least one chain to continue
            </p>
          )}
        </section>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="mt-10 flex w-full max-w-4xl items-center justify-between"
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
              onClick={nextStep}
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              Skip for now
            </button>
          )}
          <button
            onClick={nextStep}
            disabled={!canProceed}
            className="group flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            Continue
            <ChevronRight className="size-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
