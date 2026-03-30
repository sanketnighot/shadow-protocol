import { motion } from "framer-motion";
import { AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import {
  PERSONA_ARCHETYPES,
  RISK_LEVELS,
  CHAINS,
  type PersonaArchetype,
} from "@/constants/personaArchetypes";

export function StepQuickSetup() {
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const prevStep = useOnboardingStore((s) => s.prevStep);
  const agentConfig = useOnboardingStore((s) => s.agentConfig);
  const setAgentConfig = useOnboardingStore((s) => s.setAgentConfig);

  const [step, setStep] = useState<"persona" | "risk" | "chains">("persona");

  const [selectedPersona, setSelectedPersona] = useState<string>(
    agentConfig?.persona || ""
  );
  const [selectedRisk, setSelectedRisk] = useState<string>(
    agentConfig?.riskAppetite || "Moderate"
  );
  const [selectedChains, setSelectedChains] = useState<string[]>(
    agentConfig?.preferredChains || ["Ethereum", "Base"]
  );

  const handlePersonaSelect = (archetype: PersonaArchetype) => {
    setSelectedPersona(archetype.id);
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
      persona: archetype.id,
      personaText: archetype.persona,
    });
  };

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

  const canContinue = () => {
    if (step === "persona") return selectedPersona !== "";
    if (step === "risk") return selectedRisk !== "";
    if (step === "chains") return selectedChains.length > 0;
    return false;
  };

  const handleNext = () => {
    if (step === "persona") {
      setStep("risk");
    } else if (step === "risk") {
      setStep("chains");
    } else {
      nextStep();
    }
  };

  const renderPersona = () => (
    <motion.div
      key="persona"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-4xl"
    >
      <h2 className="mb-6 text-center font-mono text-xs tracking-[0.2em] text-muted uppercase">
        Choose Your Agent
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PERSONA_ARCHETYPES.map((archetype) => {
          const Icon = archetype.icon;
          return (
            <button
              key={archetype.id}
              onClick={() => handlePersonaSelect(archetype)}
              className={`group relative rounded-sm border p-4 text-left transition-all ${
                selectedPersona === archetype.id
                  ? "border-primary/50 bg-primary/10 ring-2 ring-primary/30"
                  : "border-border bg-secondary hover:border-primary/30"
              }`}
            >
              <div className={`mb-3 inline-flex rounded-sm p-2 ${archetype.bgColor}`}>
                <Icon className={`size-5 ${archetype.color}`} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">{archetype.name}</h3>
              <p className="mt-1 text-xs text-muted">{archetype.tagline}</p>
            </button>
          );
        })}
      </div>
    </motion.div>
  );

  const renderRisk = () => (
    <motion.div
      key="risk"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-2xl"
    >
      <h2 className="mb-6 text-center font-mono text-xs tracking-[0.2em] text-muted uppercase">
        Risk Appetite
      </h2>
      <div className="space-y-2">
        {RISK_LEVELS.map((risk) => (
          <button
            key={risk.id}
            onClick={() => handleRiskSelect(risk.id)}
            className={`flex w-full items-center justify-between rounded-sm border p-4 transition-all ${
              selectedRisk === risk.id
                ? "border-primary/50 bg-primary/10"
                : "border-border bg-secondary hover:border-primary/30"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{risk.icon}</span>
              <div className="text-left">
                <p className="text-sm font-medium text-foreground">{risk.name}</p>
                <p className="text-xs text-muted">{risk.tagline}</p>
              </div>
            </div>
            <p className="text-xs text-muted">Max tx: {risk.maxTx}</p>
          </button>
        ))}
      </div>
    </motion.div>
  );

  const renderChains = () => (
    <motion.div
      key="chains"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-2xl"
    >
      <h2 className="mb-6 text-center font-mono text-xs tracking-[0.2em] text-muted uppercase">
        Preferred Chains
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {CHAINS.map((chain) => (
          <button
            key={chain.id}
            onClick={() => handleChainToggle(chain.id)}
            className={`flex flex-col items-center rounded-sm border p-4 transition-all ${
              selectedChains.includes(chain.id)
                ? "border-primary/50 bg-primary/10"
                : "border-border bg-secondary hover:border-primary/30"
            }`}
          >
            <span className="mb-2 text-2xl">{chain.icon}</span>
            <p className="text-sm font-medium text-foreground">{chain.name}</p>
            <p className="mt-1 text-xs text-muted">{chain.tagline}</p>
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-muted">
        {selectedChains.length} chain{selectedChains.length !== 1 ? "s" : ""} selected
      </p>
    </motion.div>
  );

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-4">
      <AnimatePresence mode="wait">
        {step === "persona" && renderPersona()}
        {step === "risk" && renderRisk()}
        {step === "chains" && renderChains()}
      </AnimatePresence>

      <div className="mt-10 flex w-full max-w-2xl items-center justify-between">
        <button
          onClick={step === "persona" ? prevStep : () => setStep(step === "chains" ? "risk" : "persona")}
          className="flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back
        </button>

        <div className="flex items-center gap-2">
          {["persona", "risk", "chains"].map((s, i) => (
            <div
              key={s}
              className={`h-1 w-8 rounded-sm transition-colors ${
                step === s ? "bg-primary" : i < ["persona", "risk", "chains"].indexOf(step) ? "bg-primary/40" : "bg-secondary"
              }`}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          disabled={!canContinue()}
          className="group flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
        >
          {step === "chains" ? "Continue" : "Next"}
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </div>
  );
}
