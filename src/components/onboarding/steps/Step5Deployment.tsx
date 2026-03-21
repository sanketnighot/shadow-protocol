import { motion } from "framer-motion";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useOnboardingStore } from "@/store/useOnboardingStore";

const CHECKS = [
  "Initializing Local Database...",
  "Securing OS Keychain Enclave...",
  "Connecting Local AI Model...",
  "Spawning Background Watcher...",
  "Systems Online."
];

export function Step5Deployment() {
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const [activeCheck, setActiveCheck] = useState(0);

  useEffect(() => {
    if (activeCheck < CHECKS.length - 1) {
      const timer = setTimeout(() => {
        setActiveCheck((prev) => prev + 1);
      }, 600); // 600ms per check
      return () => clearTimeout(timer);
    }
  }, [activeCheck]);

  const allDone = activeCheck === CHECKS.length - 1;

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

      <div className="w-full max-w-md space-y-4 rounded-[24px] border border-border bg-background p-6 backdrop-blur-md">
        {CHECKS.map((check, i) => (
          <div key={i} className="flex items-center gap-3">
            {i < activeCheck ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-emerald-400"
              >
                <CheckCircle2 className="size-5" />
              </motion.div>
            ) : i === activeCheck ? (
              <div className="flex size-5 items-center justify-center">
                <div className="size-2 animate-pulse rounded-full bg-primary" />
              </div>
            ) : (
              <div className="size-5 rounded-full border border-border" />
            )}
            <span
              className={`font-mono text-sm ${
                i < activeCheck
                  ? "text-foreground"
                  : i === activeCheck
                  ? "text-primary animate-pulse"
                  : "text-muted"
              }`}
            >
              {check}
            </span>
          </div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: allDone ? 1 : 0, y: allDone ? 0 : 20 }}
        transition={{ duration: 0.5 }}
        className="mt-12"
      >
        <button
          onClick={completeOnboarding}
          disabled={!allDone}
          className="group relative flex items-center gap-3 overflow-hidden rounded-full border border-primary/30 bg-primary/10 px-10 py-4 text-primary transition-all hover:bg-primary/20 hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] active:scale-95 disabled:pointer-events-none"
        >
          <span className="relative z-10 font-mono font-bold tracking-widest uppercase">
            Enter The Shadows
          </span>
          <ChevronRight className="relative z-10 size-5 transition-transform group-hover:translate-x-1" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-hover:animate-[scanline_2s_linear_infinite]" />
        </button>
      </motion.div>
    </div>
  );
}
