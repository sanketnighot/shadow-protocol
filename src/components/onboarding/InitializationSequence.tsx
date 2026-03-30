import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { useOnboardingStore } from "@/store/useOnboardingStore";

import { Step0Welcome } from "./steps/Step0Welcome";
import { Step1HowItWorks } from "./steps/Step1HowItWorks";
import { Step3Uplink } from "./steps/Step3Uplink";
import { Step3Persona } from "./steps/Step3Persona";
import { Step4RiskProfile } from "./steps/Step4RiskProfile";
import { Step5MemorySeeds } from "./steps/Step5MemorySeeds";
import { Step6Vault } from "./steps/Step4Vault";
import { Step7Deployment } from "./steps/Step5Deployment";

export function InitializationSequence() {
  const currentStep = useOnboardingStore((s) => s.currentStep);
  const hasCompleted = useOnboardingStore((s) => s.hasCompletedOnboarding);
  const isReplay = useOnboardingStore((s) => s.isReplay);

  // Prevent scrolling on the body while onboarding is active
  useEffect(() => {
    if (!hasCompleted) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [hasCompleted]);

  if (hasCompleted && !isReplay) return null;

  // Total steps: 8 (0-7)
  // 0: Welcome
  // 1: How It Works
  // 2: Uplink (API keys)
  // 3: Persona
  // 4: Risk Profile
  // 5: Memory Seeds
  // 6: Vault
  // 7: Deployment

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <Step0Welcome />;
      case 1:
        return <Step1HowItWorks />;
      case 2:
        return <Step3Uplink />;
      case 3:
        return <Step3Persona />;
      case 4:
        return <Step4RiskProfile />;
      case 5:
        return <Step5MemorySeeds />;
      case 6:
        return <Step6Vault />;
      case 7:
        return <Step7Deployment />;
      default:
        return <Step0Welcome />;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-background text-foreground">
      {/* Dynamic Background */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--bg-secondary)_0%,var(--bg-primary)_100%)]" />
        <div className="absolute top-1/2 left-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-primary/10 opacity-30 blur-[120px]" />

        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      {/* Progress Indicators */}
      <div className="absolute top-8 left-1/2 z-20 flex -translate-x-1/2 gap-2">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((step) => (
          <div
            key={step}
            className={`h-1 rounded-sm transition-all duration-100 ease-out ${
              step === currentStep
                ? "w-8 bg-primary shadow-none border border-white/5"
                : step < currentStep
                ? "w-4 bg-primary/40"
                : "w-2 bg-secondary"
            }`}
          />
        ))}
      </div>

      {/* Replay indicator */}
      {isReplay && (
        <div className="absolute top-20 left-1/2 z-20 -translate-x-1/2">
          <span className="rounded-sm bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            Updating your configuration
          </span>
        </div>
      )}

      {/* Content Area */}
      <div className="relative z-10 h-full w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 1.05, filter: "blur(4px)" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex h-full w-full items-center justify-center"
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
