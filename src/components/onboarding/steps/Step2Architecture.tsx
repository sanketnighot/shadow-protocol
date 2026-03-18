import { motion } from "framer-motion";
import { Cpu, ShieldCheck, Network, ChevronRight } from "lucide-react";
import { useOnboardingStore } from "@/store/useOnboardingStore";

const CARDS = [
  {
    id: "ai",
    icon: Cpu,
    title: "Local Intelligence",
    description: "Your financial reasoning happens on-device. Zero data leaks, absolute privacy.",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
  },
  {
    id: "security",
    icon: ShieldCheck,
    title: "OS-Level Vault",
    description: "Keys never leave your machine. Secured by AES-256 and your operating system's enclave.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  {
    id: "network",
    icon: Network,
    title: "Multi-Chain Mastery",
    description: "One unified interface to command Ethereum, Arbitrum, Base, and beyond.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
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
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

export function Step2Architecture() {
  const nextStep = useOnboardingStore((s) => s.nextStep);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-12 text-center"
      >
        <h2 className="font-mono text-xs tracking-[0.2em] text-muted uppercase">Architecture</h2>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
          The Three Pillars of SHADOW
        </h1>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid w-full max-w-4xl gap-6 sm:grid-cols-3"
      >
        {CARDS.map((card) => (
          <motion.div
            key={card.id}
            variants={itemVariants}
            className="group relative overflow-hidden rounded-[24px] border border-white/10 bg-white/5 p-6 backdrop-blur-md transition-all hover:-translate-y-1 hover:border-white/20 hover:bg-white/10"
          >
            <div className={`mb-6 inline-flex rounded-xl p-3 ${card.bg} ${card.border} border`}>
              <card.icon className={`size-6 ${card.color}`} />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-foreground">{card.title}</h3>
            <p className="text-sm leading-relaxed text-muted">{card.description}</p>
            <div className={`absolute -inset-1 z-[-1] opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-30 ${card.bg}`} />
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.6 }}
        className="mt-16"
      >
        <button
          onClick={nextStep}
          className="group flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-white/10"
        >
          Acknowledge
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-1" />
        </button>
      </motion.div>
    </div>
  );
}
