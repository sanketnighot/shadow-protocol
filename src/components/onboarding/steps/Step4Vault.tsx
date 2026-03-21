import { motion, AnimatePresence } from "framer-motion";
import { Copy, CheckCircle2, ChevronRight, AlertTriangle, Download } from "lucide-react";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { useWalletStore } from "@/store/useWalletStore";
import { useToast } from "@/hooks/useToast";

export function Step4Vault() {
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const prevStep = useOnboardingStore((s) => s.prevStep);
  const refreshWallets = useWalletStore((s) => s.refreshWallets);
  const { success, warning: toastWarning } = useToast();

  const [mode, setMode] = useState<"select" | "generate" | "import">("select");
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [importKey, setImportKey] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const handleGenerate = async () => {
    setIsProcessing(true);
    setMode("generate");
    try {
      const result = await invoke<{ address: string; mnemonic: string }>("wallet_create", {
        input: { word_count: 12 },
      });
      setMnemonic(result.mnemonic.split(" "));
      await refreshWallets();
    } catch (e) {
      toastWarning("Failed to generate wallet", String(e));
      setMode("select");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = async () => {
    if (!importKey) return;
    setIsProcessing(true);
    try {
      if (importKey.includes(" ")) {
        await invoke("wallet_import_mnemonic", { input: { mnemonic: importKey } });
      } else {
        await invoke("wallet_import_private_key", { input: { private_key: importKey } });
      }
      await refreshWallets();
      success("Wallet imported", "Your identity has been secured in the vault.");
      nextStep();
    } catch (e) {
      toastWarning("Import failed", String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(mnemonic.join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderSelect = () => (
    <motion.div
      key="select"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex w-full max-w-md flex-col gap-4"
    >
      <button
        onClick={handleGenerate}
        disabled={isProcessing}
        className="group relative flex flex-col items-center justify-center overflow-hidden rounded-sm border border-border bg-secondary p-8 backdrop-blur-md transition-all hover:border-emerald-500/30 hover:bg-emerald-500/10"
      >
        <div className="mb-4 rounded-sm bg-emerald-500/20 p-4 text-emerald-400">
          <CheckCircle2 className="size-8" />
        </div>
        <h3 className="text-xl font-bold text-foreground">Generate New Identity</h3>
        <p className="mt-2 text-center text-sm text-muted">Create a secure, local 12-word seed phrase. Never stored in the cloud.</p>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent to-emerald-500/5 opacity-0 transition-opacity duration-100 ease-out group-hover:opacity-100" />
      </button>

      <button
        onClick={() => setMode("import")}
        className="group flex items-center justify-between rounded-sm border border-border bg-secondary p-5 transition-all hover:bg-surface-elevated"
      >
        <div className="flex items-center gap-4">
          <div className="rounded-sm bg-surface-elevated p-2 text-muted">
            <Download className="size-5" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-foreground">Import Existing</h3>
            <p className="text-xs text-muted">Use a seed phrase or private key.</p>
          </div>
        </div>
        <ChevronRight className="size-5 text-muted transition-transform group-hover:translate-x-1" />
      </button>
    </motion.div>
  );

  const renderGenerate = () => (
    <motion.div
      key="generate"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-2xl"
    >
      <div className="mb-6 flex items-center gap-3 rounded-[16px] border border-orange-500/20 bg-orange-500/10 p-4 text-orange-200">
        <AlertTriangle className="size-5 shrink-0 text-orange-400" />
        <p className="text-sm">
          Write these words down on paper. If you lose them, your assets are unrecoverable. 
          SHADOW cannot restore your key.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {mnemonic.map((word, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3 rounded-[16px] border border-border bg-background px-4 py-3"
          >
            <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</span>
            <span className="font-mono font-medium text-foreground">{word}</span>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 rounded-sm border border-border bg-secondary px-6 py-2.5 text-sm font-medium text-foreground transition-hover hover:bg-surface-elevated"
        >
          {copied ? <CheckCircle2 className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy to clipboard"}
        </button>

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="size-4 rounded border border-border bg-background text-primary focus:ring-primary/50"
          />
          <span className="text-sm text-muted">I have securely backed up my seed phrase.</span>
        </label>
      </div>
    </motion.div>
  );

  const renderImport = () => (
    <motion.div
      key="import"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-md space-y-4"
    >
      <div className="rounded-sm border border-border bg-secondary p-5 backdrop-blur-md">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Seed Phrase or Private Key</h3>
        <textarea
          value={importKey}
          onChange={(e) => setImportKey(e.target.value)}
          placeholder="Enter 12/24 words or a hex private key..."
          className="h-32 w-full resize-none rounded-sm border border-border bg-background px-4 py-3 text-sm font-mono text-foreground focus:border-primary/50 focus:outline-none"
        />
      </div>
      <div className="flex justify-end">
        <button
          onClick={handleImport}
          disabled={isProcessing || !importKey}
          className="flex items-center gap-2 rounded-sm bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
        >
          {isProcessing ? "Decrypting..." : "Import Identity"}
        </button>
      </div>
    </motion.div>
  );

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 text-center"
      >
        <h2 className="font-mono text-xs tracking-[0.2em] text-muted uppercase">The Vault</h2>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
          Seal Your Identity
        </h1>
        <p className="mt-2 text-sm text-muted">
          Your keys are encrypted locally using your operating system's secure enclave.
        </p>
      </motion.div>

      <AnimatePresence mode="wait">
        {mode === "select" && renderSelect()}
        {mode === "generate" && renderGenerate()}
        {mode === "import" && renderImport()}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed bottom-12 flex w-full max-w-2xl items-center justify-between px-4"
      >
        <button
          onClick={() => (mode === "select" ? prevStep() : setMode("select"))}
          className="text-sm text-muted hover:text-foreground"
        >
          Back
        </button>
        
        {mode === "select" && (
          <button
            onClick={nextStep}
            className="text-sm text-muted hover:text-foreground"
          >
            Skip for now
          </button>
        )}
        
        {mode === "generate" && (
          <button
            onClick={nextStep}
            disabled={!acknowledged}
            className="group flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            Seal Vault
            <ChevronRight className="size-4 transition-transform group-hover:translate-x-1" />
          </button>
        )}
      </motion.div>
    </div>
  );
}
