import { motion } from "framer-motion";
import { ChevronRight, Brain, Shield, Network } from "lucide-react";
import { useOnboardingStore } from "@/store/useOnboardingStore";

const PILLARS = [
  {
    id: "ai",
    icon: Brain,
    title: "AI That Lives on Your Computer",
    description:
      "Your personal assistant analyzes your portfolio without sending data to the cloud. It learns your preferences and helps you make smarter DeFi decisions.",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    detail: "All conversations and data stay private. No cloud processing means no data leaks.",
  },
  {
    id: "security",
    icon: Shield,
    title: "Bank-Level Security, Locally",
    description:
      "Your wallet keys are encrypted using your computer's secure chip. Even we can't access them. You control everything.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    detail: "Lose your seed phrase, lose your funds—so back it up securely!",
  },
  {
    id: "network",
    icon: Network,
    title: "All Your Chains, One Place",
    description:
      "Track and trade across Ethereum, Base, and Polygon from a single dashboard. No more juggling multiple wallets or tabs.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    detail: "See your unified portfolio across all chains. Execute swaps with a single click.",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 250, damping: 25 } },
};

export function Step1HowItWorks() {
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const prevStep = useOnboardingStore((s) => s.prevStep);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-10 text-center"
      >
        <h2 className="font-mono text-xs tracking-[0.2em] text-muted uppercase">How It Works</h2>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
          Three Core Principles
        </h1>
        <p className="mt-3 max-w-lg text-sm text-muted">
          SHADOW Protocol is built on privacy, security, and simplicity. Here's what makes it different.
        </p>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid w-full max-w-4xl gap-6 lg:grid-cols-3"
      >
        {PILLARS.map((pillar) => (
          <motion.div
            key={pillar.id}
            variants={itemVariants}
            className="group relative overflow-hidden rounded-sm border border-border bg-secondary p-6 backdrop-blur-md transition-all duration-300 hover:border-primary/30 hover:bg-surface-elevated"
          >
            <div
              className={`mb-5 inline-flex rounded-sm p-3 ${pillar.bg} ${pillar.border} border`}
            >
              <pillar.icon className={`size-6 ${pillar.color}`} />
            </div>

            <h3 className="mb-2 text-lg font-semibold text-foreground">{pillar.title}</h3>
            <p className="text-sm leading-relaxed text-muted">{pillar.description}</p>

            <motion.div
              initial={{ opacity: 0, height: 0 }}
              whileHover={{ opacity: 1, height: "auto" }}
              className="mt-4 overflow-hidden"
            >
              <div className="rounded-sm bg-background/50 p-3 text-xs text-muted">
                {pillar.detail}
              </div>
            </motion.div>

            <div
              className={`absolute -inset-1 -z-10 opacity-0 blur-2xl transition-opacity duration-100 ease-out group-hover:opacity-25 ${pillar.bg}`}
            />
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.6 }}
        className="mt-12 flex items-center gap-6"
      >
        <button
          onClick={prevStep}
          className="text-sm text-muted transition-colors hover:text-foreground"
        >
          Back
        </button>
        <button
          onClick={nextStep}
          className="group flex items-center gap-2 rounded-sm px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated"
        >
          Got it
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-1" />
        </button>
      </motion.div>
    </div>
  );
}
