import { motion } from "framer-motion";
import { CheckCircle2, ChevronRight, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { AGENT_WELCOME_MESSAGES, PERSONA_ARCHETYPES } from "@/constants/personaArchetypes";

const CHECKS = [
  { text: "Initializing secure database...", type: "system" as const },
  { text: "Configuring agent personality...", type: "agent" as const },
  { text: "Calibrating risk sensors...", type: "agent" as const },
  { text: "Mapping preferred chains...", type: "agent" as const },
  { text: "Seeding agent memory...", type: "agent" as const },
  { text: "Systems online.", type: "system" as const },
];

export function Step7Deployment() {
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const agentConfig = useOnboardingStore((s) => s.agentConfig);
  const isReplay = useOnboardingStore((s) => s.isReplay);
  const cancelReplay = useOnboardingStore((s) => s.cancelReplay);

  const [activeCheck, setActiveCheck] = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);

  const allDone = activeCheck === CHECKS.length - 1;

  useEffect(() => {
    if (activeCheck < CHECKS.length - 1) {
      const timer = setTimeout(() => {
        setActiveCheck((prev) => prev + 1);
      }, 600);
      return () => clearTimeout(timer);
    } else if (activeCheck === CHECKS.length - 1 && !showWelcome) {
      const timer = setTimeout(() => {
        setShowWelcome(true);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [activeCheck, showWelcome]);

  const personaId = agentConfig?.persona || "custom";
  const personaName = PERSONA_ARCHETYPES.find((p) => p.id === personaId)?.name || "Your Shadow";
  const welcomeMessage = AGENT_WELCOME_MESSAGES[personaId] || AGENT_WELCOME_MESSAGES.custom;

  const handleComplete = () => {
    if (isReplay) {
      cancelReplay();
    }
    completeOnboarding();
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 text-center"
      >
        <h2 className="font-mono text-xs tracking-[0.2em] text-muted uppercase">Deployment</h2>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
          System Initialization
        </h1>
      </motion.div>

      <div className="w-full max-w-md space-y-4 rounded-sm border border-border bg-background p-6 backdrop-blur-md">
        {CHECKS.map((check, i) => (
          <div key={i} className="flex items-center gap-3">
            {i < activeCheck ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={check.type === "agent" ? "text-primary" : "text-emerald-400"}
              >
                <CheckCircle2 className="size-5" />
              </motion.div>
            ) : i === activeCheck ? (
              <div className="flex size-5 items-center justify-center">
                <div className="size-2 animate-pulse rounded-sm bg-primary" />
              </div>
            ) : (
              <div className="size-5 rounded-sm border border-border" />
            )}
            <span
              className={`font-mono text-sm ${
                i < activeCheck
                  ? check.type === "agent"
                    ? "text-primary"
                    : "text-foreground"
                  : i === activeCheck
                  ? "text-primary animate-pulse"
                  : "text-muted"
              }`}
            >
              {check.text}
            </span>
          </div>
        ))}
      </div>

      {/* Agent Welcome */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: showWelcome ? 1 : 0, scale: showWelcome ? 1 : 0.95 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mt-8 w-full max-w-md"
      >
        {showWelcome && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-sm border border-primary/30 bg-primary/5 p-6 text-center"
          >
            <div className="mb-4 flex justify-center">
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                  opacity: [0.8, 1, 0.8],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="rounded-full bg-primary/20 p-4"
              >
                <Sparkles className="size-8 text-primary" />
              </motion.div>
            </div>
            <p className="text-lg font-semibold text-foreground">{personaName}</p>
            <p className="mt-2 text-sm italic text-muted">"{welcomeMessage}"</p>
          </motion.div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: showWelcome ? 1 : 0, y: showWelcome ? 0 : 20 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-8"
      >
        <button
          onClick={handleComplete}
          disabled={!allDone}
          className="group relative flex items-center gap-3 overflow-hidden rounded-sm border border-primary/30 bg-primary/10 px-10 py-4 text-primary transition-all hover:bg-primary/20 hover:shadow-none active:scale-95 disabled:pointer-events-none border border-white/5"
        >
          <span className="relative z-10 font-mono font-bold tracking-widest uppercase">
            {isReplay ? "Save Changes" : "Enter SHADOW Protocol"}
          </span>
          <ChevronRight className="relative z-10 size-5 transition-transform group-hover:translate-x-1" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 transition-opacity duration-100 ease-out group-hover:opacity-100 group-hover:animate-[scanline_2s_linear_infinite]" />
        </button>
      </motion.div>
    </div>
  );
}
