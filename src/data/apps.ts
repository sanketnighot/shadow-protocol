export type AppStatus = "active" | "inactive" | "error" | "updating" | "paused";

export type ShadowApp = {
  id: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  icon: string;
  version: string;
  author: string;
  rating?: number;
  installCount?: string;
  status?: AppStatus;
  isInstalled: boolean;
  features: string[];
  permissions: string[];
  metrics?: {
    label: string;
    value: string;
  };
};

export const MOCK_APPS: ShadowApp[] = [
  {
    id: "lit-protocol",
    name: "Lit Protocol",
    shortDescription: "Agent Wallet Manager",
    longDescription: "Create non-custodial wallets for your AI agent with programmable guardrails...",
    icon: "Zap", // We'll map this to lucide icon in the component
    version: "v1.0.2",
    author: "Lit Protocol",
    isInstalled: true,
    status: "active",
    features: [
      "Vincent API wallet creation",
      "Spending limits & policies",
      "DeFi protocol integrations"
    ],
    permissions: [
      "Access to wallet balance",
      "Sign transactions on your behalf"
    ],
    metrics: {
      label: "Usage",
      value: "24 transactions this week"
    }
  },
  {
    id: "flow-blockchain",
    name: "Flow Blockchain",
    shortDescription: "Flow Network Integration",
    longDescription: "Seamlessly execute transactions and manage assets on the Flow blockchain.",
    icon: "Waves",
    version: "v2.1.0",
    author: "Flow Foundation",
    isInstalled: true,
    status: "active",
    features: [
      "Native Flow asset support",
      "Cadence script execution",
      "NFT portfolio sync"
    ],
    permissions: [
      "Access to Flow network",
      "Sign Flow transactions"
    ],
    metrics: {
      label: "Usage",
      value: "12 interactions this month"
    }
  },
  {
    id: "filecoin-storage",
    name: "Filecoin Storage",
    shortDescription: "Decentralized State Backup",
    longDescription: "Securely backup your AI agent's state and history to the Filecoin network.",
    icon: "HardDrive",
    version: "v0.9.5",
    author: "Protocol Labs",
    isInstalled: true,
    status: "inactive",
    features: [
      "Automated state backups",
      "End-to-end encryption",
      "Verifiable storage proofs"
    ],
    permissions: [
      "Read agent state",
      "Network access"
    ]
  },
  {
    id: "storacha",
    name: "Storacha",
    shortDescription: "AI Storage Network",
    longDescription: "High-performance decentralized storage optimized for AI models and data.",
    icon: "Globe",
    version: "v1.0.0",
    author: "Protocol Labs",
    rating: 4.8,
    installCount: "1.2k",
    isInstalled: false,
    features: [
      "High-throughput retrieval",
      "Model checkpointing",
      "Distributed cache"
    ],
    permissions: [
      "Network access",
      "Read/write local cache"
    ]
  },
  {
    id: "zama-privacy",
    name: "Zama",
    shortDescription: "Private Txn Execution",
    longDescription: "Fully Homomorphic Encryption (FHE) for your Web3 transactions.",
    icon: "Lock",
    version: "v0.8.2",
    author: "Zama.ai",
    rating: 4.9,
    installCount: "3.4k",
    isInstalled: false,
    features: [
      "Encrypted mempool routing",
      "Private token swaps",
      "Front-running protection"
    ],
    permissions: [
      "Intercept transaction routing",
      "Sign encrypted payloads"
    ]
  },
  {
    id: "world-id",
    name: "World ID",
    shortDescription: "Human Verification",
    longDescription: "Prove you are a unique human to access gated DeFi opportunities.",
    icon: "ScanFace",
    version: "v2.0.1",
    author: "Tools for Humanity",
    rating: 4.5,
    installCount: "12k",
    isInstalled: false,
    features: [
      "Zero-knowledge proofs",
      "Sybil resistance",
      "Priority queuing"
    ],
    permissions: [
      "Access World ID credentials"
    ]
  }
];
