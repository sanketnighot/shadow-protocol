import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { useOnboardingStore } from "@/store/useOnboardingStore";

export function Step0Welcome() {
  const nextStep = useOnboardingStore((s) => s.nextStep);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative mb-8 flex flex-col items-center"
      >
        <div className="absolute -inset-20 bg-primary/30 opacity-60 blur-[100px]" />
        <img
          src="/icons/shadow.png"
          alt="SHADOW Protocol"
          className="relative z-10 h-24 w-24 object-contain drop-shadow-none border border-white/5"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-center"
      >
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          SHADOW Protocol
        </h1>
        <p className="mt-2 text-sm text-primary">Your Private DeFi Command Center</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        <button
          onClick={nextStep}
          className="group relative flex items-center gap-3 overflow-hidden rounded-sm border border-primary/30 bg-primary/10 px-10 py-4 text-primary transition-all hover:bg-primary/20 hover:shadow-none active:scale-95 border border-white/5"
        >
          <span className="relative z-10 font-mono text-sm font-semibold tracking-widest uppercase">
            Get Started
          </span>
          <ChevronRight className="relative z-10 size-4 transition-transform group-hover:translate-x-1" />
        </button>
      </motion.div>
    </div>
  );
}
