import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface GlitchTextProps {
  text: string;
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  delay?: number;
  speed?: number;
}

export function GlitchText({
  text,
  as: Component = "span",
  className,
  delay = 0,
  speed = 40,
}: GlitchTextProps) {
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    let timeout: number;
    let currentIndex = 0;

    const startTyping = () => {
      setIsTyping(true);
      const interval = setInterval(() => {
        if (currentIndex <= text.length) {
          setDisplayText(text.slice(0, currentIndex));
          currentIndex++;
        } else {
          clearInterval(interval);
          setIsTyping(false);
        }
      }, speed);
      
      return () => clearInterval(interval);
    };

    if (delay > 0) {
      timeout = window.setTimeout(startTyping, delay);
    } else {
      startTyping();
    }

    return () => clearTimeout(timeout);
  }, [text, delay, speed]);

  const MotionComponent = motion(Component as any);

  return (
    <MotionComponent
      className={cn(
        "font-mono relative inline-block",
        className
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: delay / 1000 }}
    >
      {displayText}
      {isTyping && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ repeat: Infinity, duration: 0.6, ease: "linear" }}
          className="inline-block w-2 h-4 ml-1 bg-primary/70 align-middle shadow-[0_0_8px_rgba(139,92,246,0.6)]"
        />
      )}
    </MotionComponent>
  );
}
