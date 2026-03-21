import { useEffect, useState } from "react";

const GLYPHS = ["§", "‡", "†", "∆", "◊", "ø", "π", "∑", "∞", "≈", "√", "∫", "µ"];
const HEX_FRAGMENTS = ["A1", "F4", "0E", "C9", "B2", "D3", "8F", "77", "33"];

export function ThinkingLoader() {
  const [glyph, setGlyph] = useState("§");
  const [hex, setHex] = useState("A1");
  const [traceState, setTraceState] = useState("INITIALIZING");

  useEffect(() => {
    const glyphInterval = setInterval(() => {
      setGlyph(GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);
    }, 120);

    const hexInterval = setInterval(() => {
      setHex(HEX_FRAGMENTS[Math.floor(Math.random() * HEX_FRAGMENTS.length)]);
    }, 300);

    const stateInterval = setInterval(() => {
      const states = ["TRACE_INIT", "DECRYPT_PK", "SCAN_MEMPOOL", "SIGN_VAL", "EXEC_ROUTE"];
      setTraceState(states[Math.floor(Math.random() * states.length)]);
    }, 2000);

    return () => {
      clearInterval(glyphInterval);
      clearInterval(hexInterval);
      clearInterval(stateInterval);
    };
  }, []);

  return (
    <div className="flex h-6 items-center gap-3 font-mono text-[10px] tracking-widest text-primary/80">
      <div className="flex items-center gap-1.5 rounded-sm border border-primary/20 bg-primary/5 px-2 py-0.5">
        <span className="animate-pulse">{glyph}</span>
        <span className="opacity-50">{hex}</span>
      </div>
      <span className="animate-pulse opacity-60">{traceState}</span>
      <div className="h-4 w-0.5 animate-quantum-caret bg-primary" />
    </div>
  );
}
