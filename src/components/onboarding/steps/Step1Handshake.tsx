import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { GlitchText } from "../ui/GlitchText";
import { useOnboardingStore } from "@/store/useOnboardingStore";

export function Step1Handshake() {
  const nextStep = useOnboardingStore((s) => s.nextStep);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="relative mb-12 flex flex-col items-center"
      >
        <div className="absolute -inset-20 bg-primary/20 opacity-50 blur-[80px]" />
        <img
          src="/icons/shadow.png"
          alt="SHADOW Protocol"
          className="relative z-10 h-32 w-32 object-contain drop-shadow-[0_0_15px_rgba(139,92,246,0.5)]"
        />
      </motion.div>

      <div className="mb-16 flex h-8 items-center justify-center text-center">
        <GlitchText
          text="[SYSTEM]: Awaiting initialization..."
          className="text-lg text-primary/80"
          speed={50}
          delay={500}
        />
      </div>

      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.5, duration: 0.8 }}
        onClick={nextStep}
        className="group relative flex items-center gap-3 overflow-hidden rounded-full border border-primary/30 bg-primary/10 px-8 py-4 text-primary transition-all hover:bg-primary/20 hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] active:scale-95"
      >
        <span className="relative z-10 font-mono text-sm tracking-widest uppercase">
          Initiate Sequence
        </span>
        <ChevronRight className="relative z-10 size-4 transition-transform group-hover:translate-x-1" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-hover:animate-[scanline_2s_linear_infinite]" />
      </motion.button>
    </div>
  );
}
