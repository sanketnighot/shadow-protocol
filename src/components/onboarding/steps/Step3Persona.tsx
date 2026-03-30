import { motion } from "framer-motion";
import { ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { useState } from "react";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { PERSONA_ARCHETYPES, type PersonaArchetype } from "@/constants/personaArchetypes";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

function PersonaCard({
  archetype,
  selected,
  onSelect,
}: {
  archetype: PersonaArchetype;
  selected: boolean;
  onSelect: () => void;
}) {
  const [showSample, setShowSample] = useState(false);
  const Icon = archetype.icon;

  return (
    <motion.div
      variants={itemVariants}
      className="relative"
    >
      <motion.button
        onClick={onSelect}
        onMouseEnter={() => setShowSample(true)}
        onMouseLeave={() => setShowSample(false)}
        className={`group relative w-full overflow-hidden rounded-sm border p-5 text-left transition-all duration-200 ${
          selected
            ? "border-primary/50 bg-primary/10 shadow-none ring-2 ring-primary/30"
            : "border-border bg-secondary hover:border-primary/30 hover:bg-surface-elevated"
        }`}
      >
        <div className={`mb-4 inline-flex rounded-sm p-2.5 ${archetype.bgColor}`}>
          <Icon className={`size-5 ${archetype.color}`} />
        </div>

        <h3 className="mb-1 text-base font-semibold text-foreground">{archetype.name}</h3>
        <p className="text-xs text-muted">{archetype.tagline}</p>

        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: showSample ? 1 : 0, height: showSample ? "auto" : 0 }}
          className="mt-3 overflow-hidden"
        >
          <div className="rounded-sm bg-background/80 p-3 text-xs text-muted">
            <p className="mb-1.5 font-medium text-foreground/80">Sample response:</p>
            <p className="italic">"{archetype.sampleResponse}"</p>
          </div>
        </motion.div>

        {selected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-sm bg-primary"
          >
            <Sparkles className="size-3 text-white" />
          </motion.div>
        )}
      </motion.button>
    </motion.div>
  );
}

export function Step3Persona() {
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const prevStep = useOnboardingStore((s) => s.prevStep);
  const agentConfig = useOnboardingStore((s) => s.agentConfig);
  const setAgentConfig = useOnboardingStore((s) => s.setAgentConfig);
  const isReplay = useOnboardingStore((s) => s.isReplay);

  const selectedPersona = agentConfig?.persona || "";

  const handleSelect = (archetype: PersonaArchetype) => {
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

  const canProceed = selectedPersona !== "";

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-8 text-center"
      >
        <h2 className="font-mono text-xs tracking-[0.2em] text-muted uppercase">Meet Your Agent</h2>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
          Choose Your Shadow's Personality
        </h1>
        <p className="mt-3 max-w-lg text-sm text-muted">
          Your AI agent will adapt its communication style based on your choice.
          Select the personality that best matches your trading style.
        </p>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid w-full max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {PERSONA_ARCHETYPES.map((archetype) => (
          <PersonaCard
            key={archetype.id}
            archetype={archetype}
            selected={selectedPersona === archetype.id}
            onSelect={() => handleSelect(archetype)}
          />
        ))}
      </motion.div>

      {selectedPersona && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 max-w-md rounded-sm border border-primary/20 bg-primary/5 p-4"
        >
          <p className="text-sm text-foreground">
            <span className="font-medium">Your Shadow will be: </span>
            <span className="text-primary">
              {PERSONA_ARCHETYPES.find((a) => a.id === selectedPersona)?.name}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted">
            {selectedPersona === "ghost"
              ? "Your agent will prioritize privacy and minimal data exposure."
              : selectedPersona === "analyst"
              ? "Your agent will provide data-driven insights and precise metrics."
              : selectedPersona === "strategist"
              ? "Your agent will proactively identify opportunities for you."
              : "Your agent will focus on protecting your assets from risk."}
          </p>
        </motion.div>
      )}

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
            {canProceed ? "Continue" : "Select a personality"}
            <ChevronRight className="size-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
