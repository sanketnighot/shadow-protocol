import { motion } from "framer-motion";
import { ChevronRight, Key } from "lucide-react";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useOnboardingStore } from "@/store/useOnboardingStore";

export function Step3Uplink() {
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const prevStep = useOnboardingStore((s) => s.prevStep);

  const [alchemyKey, setAlchemyKey] = useState("");
  const [perplexityKey, setPerplexityKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [systemInfo, setSystemInfo] = useState<{ totalMemoryGb: number; cpuCount: number } | null>(null);

  useEffect(() => {
    // Attempt to get system info to show "Recommended Model"
    const fetchSysInfo = async () => {
      try {
        const info = await invoke<{ totalMemoryGb: number; cpuCount: number }>("get_system_info");
        setSystemInfo(info);
      } catch (e) {
        console.error("Failed to get system info", e);
      }
    };
    void fetchSysInfo();
  }, []);

  const handleConnect = async () => {
    setIsSaving(true);
    try {
      if (alchemyKey) {
        await invoke("set_alchemy_key", { input: { key: alchemyKey } });
      }
      if (perplexityKey) {
        await invoke("set_perplexity_key", { input: { key: perplexityKey } });
      }
      // Short delay for "connecting" effect
      await new Promise((resolve) => setTimeout(resolve, 800));
      nextStep();
    } catch (e) {
      console.error("Failed to save keys", e);
      // Even if it fails, we let them proceed or we could show an error. Let's proceed for frictionless UX.
      nextStep();
    } finally {
      setIsSaving(false);
    }
  };

  const recommendedModel = systemInfo 
    ? (systemInfo.totalMemoryGb >= 16 ? "Llama 3.2 (3B) / Qwen 2.5" : "Qwen 2.5 (1.5B)")
    : "Llama 3.2 (3B)";

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 text-center"
      >
        <h2 className="font-mono text-xs tracking-[0.2em] text-muted uppercase">Data Uplink</h2>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
          Establish Connections
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          Connect external providers to feed your local intelligence with real-time onchain data and market research.
        </p>
      </motion.div>

      <div className="w-full max-w-md space-y-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-sm border border-border bg-secondary p-5 backdrop-blur-md"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-blue-500/20 text-blue-400">
              <Key className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Alchemy API Key</h3>
              <p className="text-xs text-muted">Required for portfolio tracking</p>
            </div>
          </div>
          <input
            type="password"
            value={alchemyKey}
            onChange={(e) => setAlchemyKey(e.target.value)}
            placeholder="your-alchemy-api-key"
            className="w-full rounded-sm border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-primary/50 focus:outline-none"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-sm border border-border bg-secondary p-5 backdrop-blur-md"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-purple-500/20 text-purple-400">
              <Key className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Perplexity (Sonar) API Key</h3>
              <p className="text-xs text-muted">Required for Web Search tool</p>
            </div>
          </div>
          <input
            type="password"
            value={perplexityKey}
            onChange={(e) => setPerplexityKey(e.target.value)}
            placeholder="pplx-xxxxxxxxxxxxxxxx"
            className="w-full rounded-sm border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-primary/50 focus:outline-none"
          />
        </motion.div>

        {systemInfo && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-4 flex items-center justify-center gap-2 text-xs text-muted"
          >
            <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500 animate-pulse" />
            System scan complete. Recommended local model: <strong className="text-foreground">{recommendedModel}</strong>
          </motion.div>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-12 flex w-full max-w-md items-center justify-between"
      >
        <button
          onClick={prevStep}
          className="text-sm text-muted hover:text-foreground"
        >
          Back
        </button>
        
        <div className="flex items-center gap-4">
          <button
            onClick={nextStep}
            className="text-sm text-muted hover:text-foreground"
          >
            Skip for now
          </button>
          <button
            onClick={handleConnect}
            disabled={isSaving || (!alchemyKey && !perplexityKey)}
            className="group flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving ? "Connecting..." : "Connect"}
            {!isSaving && <ChevronRight className="size-4 transition-transform group-hover:translate-x-1" />}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
