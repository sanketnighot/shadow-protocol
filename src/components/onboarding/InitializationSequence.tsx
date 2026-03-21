import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { useOnboardingStore } from "@/store/useOnboardingStore";

import { Step1Handshake } from "./steps/Step1Handshake";
import { Step2Architecture } from "./steps/Step2Architecture";
import { Step3Uplink } from "./steps/Step3Uplink";
import { Step4Vault } from "./steps/Step4Vault";
import { Step5Deployment } from "./steps/Step5Deployment";

export function InitializationSequence() {
  const currentStep = useOnboardingStore((s) => s.currentStep);
  const hasCompleted = useOnboardingStore((s) => s.hasCompletedOnboarding);

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

  if (hasCompleted) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-background text-foreground">
      {/* Dynamic Background */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--bg-secondary)_0%,var(--bg-primary)_100%)]" />
        <div className="absolute top-1/2 left-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 opacity-30 blur-[120px]" />
        
        {/* Subtle grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "40px 40px"
          }}
        />
      </div>

      {/* Progress Indicators */}
      <div className="absolute top-8 left-1/2 z-20 flex -translate-x-1/2 gap-3">
        {[0, 1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className={`h-1 rounded-full transition-all duration-500 ${
              step === currentStep
                ? "w-8 bg-primary shadow-[0_0_8px_rgba(139,92,246,0.8)]"
                : step < currentStep
                ? "w-4 bg-primary/40"
                : "w-2 bg-secondary"
            }`}
          />
        ))}
      </div>

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
            {currentStep === 0 && <Step1Handshake />}
            {currentStep === 1 && <Step2Architecture />}
            {currentStep === 2 && <Step3Uplink />}
            {currentStep === 3 && <Step4Vault />}
            {currentStep === 4 && <Step5Deployment />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
