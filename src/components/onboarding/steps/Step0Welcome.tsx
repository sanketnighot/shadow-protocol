import { motion } from "framer-motion";
import { ChevronRight, KeyRound, Bot, Globe } from "lucide-react";
import { useOnboardingStore } from "@/store/useOnboardingStore";

const BENEFITS = [
  {
    icon: KeyRound,
    title: "Your keys stay on your device",
    description: "We never see or store your private keys. They're encrypted using your computer's secure enclave.",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  {
    icon: Bot,
    title: "AI that runs locally",
    description: "Your personal assistant analyzes DeFi opportunities without sending data to the cloud.",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
  },
  {
    icon: Globe,
    title: "All your chains, one place",
    description: "Track and trade across Ethereum, Base, and Polygon from a single dashboard.",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

export function Step0Welcome() {
  const nextStep = useOnboardingStore((s) => s.nextStep);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="relative mb-8 flex flex-col items-center"
      >
        <div className="absolute -inset-20 bg-primary/30 opacity-60 blur-[100px]" />
        <img
          src="/icons/shadow.png"
          alt="SHADOW Protocol"
          className="relative z-10 h-28 w-28 object-contain drop-shadow-none border border-white/5"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="mb-3 text-center"
      >
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          SHADOW Protocol
        </h1>
        <p className="mt-2 text-lg text-primary">Your Private DeFi Command Center</p>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="mb-10 max-w-xl text-center text-sm leading-relaxed text-muted"
      >
        A privacy-first desktop app that puts YOU in control of your DeFi portfolio.
        Track assets, execute trades, and automate strategies—all without exposing your data to third parties.
      </motion.p>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="mb-12 grid w-full max-w-3xl gap-4 sm:grid-cols-3"
      >
        {BENEFITS.map((benefit) => (
          <motion.div
            key={benefit.title}
            variants={itemVariants}
            className="group relative overflow-hidden rounded-sm border border-border bg-secondary p-5 backdrop-blur-md transition-all hover:-translate-y-1 hover:border-primary/30"
          >
            <div className={`mb-4 inline-flex rounded-sm p-2.5 ${benefit.bgColor}`}>
              <benefit.icon className={`size-5 ${benefit.color}`} />
            </div>
            <h3 className="mb-1.5 text-sm font-semibold text-foreground">{benefit.title}</h3>
            <p className="text-xs leading-relaxed text-muted">{benefit.description}</p>
            <div className={`absolute -inset-1 -z-10 opacity-0 blur-2xl transition-opacity duration-100 ease-out group-hover:opacity-20 ${benefit.bgColor}`} />
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6 }}
      >
        <button
          onClick={nextStep}
          className="group relative flex items-center gap-3 overflow-hidden rounded-sm border border-primary/30 bg-primary/10 px-10 py-4 text-primary transition-all hover:bg-primary/20 hover:shadow-none active:scale-95 border border-white/5"
        >
          <span className="relative z-10 font-mono text-sm font-semibold tracking-widest uppercase">
            Get Started
          </span>
          <ChevronRight className="relative z-10 size-4 transition-transform group-hover:translate-x-1" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 transition-opacity duration-100 ease-out group-hover:opacity-100 group-hover:animate-[scanline_2s_linear_infinite]" />
        </button>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.6 }}
        className="mt-6 text-xs text-muted"
      >
        Setup takes about 3 minutes
      </motion.p>
    </div>
  );
}
