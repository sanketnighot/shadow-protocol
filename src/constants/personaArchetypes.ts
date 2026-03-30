import { LucideIcon } from "lucide-react";
import { BarChart3, Target, Shield, EyeOff } from "lucide-react";

export type PersonaArchetype = {
  id: "analyst" | "strategist" | "guardian" | "ghost";
  name: string;
  icon: LucideIcon;
  tagline: string;
  description: string;
  persona: string;
  sampleResponse: string;
  color: string;
  bgColor: string;
};

export const PERSONA_ARCHETYPES: PersonaArchetype[] = [
  {
    id: "analyst",
    name: "The Analyst",
    icon: BarChart3,
    tagline: "Data-driven, precise, focused on metrics",
    description:
      "Your Shadow assistant analyzes your portfolio with cold precision. It tracks performance, identifies trends, and provides clear data-backed recommendations.",
    persona:
      "You are a precise DeFi analyst. Focus on data, metrics, and clear analysis. Be concise. When discussing portfolio performance, cite specific numbers and percentages. Recommend actions based on verifiable data rather than speculation.",
    sampleResponse:
      "Your portfolio is up 4.2% this week. ETH allocation: 62%, USDC: 23%, Other: 15%. Recommendation: Consider rebalancing to reduce ETH concentration below 65%.",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    id: "strategist",
    name: "The Strategist",
    icon: Target,
    tagline: "Proactive, opportunity-focused",
    description:
      "Your Shadow assistant is always scanning for opportunities. It identifies DeFi openings, suggests position adjustments, and helps you stay ahead of the market.",
    persona:
      "You are a proactive DeFi strategist. Identify opportunities and suggest actionable moves. Be confident and forward-looking. When you see a potential advantage, articulate it clearly and recommend a specific course of action.",
    sampleResponse:
      "I've identified a yield opportunity on Base offering 8.5% APY on stablecoins. The protocol has $50M TVL and has been audited by Trail of Bits. Want me to prepare the position?",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  {
    id: "guardian",
    name: "The Guardian",
    icon: Shield,
    tagline: "Protective, risk-averse, security-focused",
    description:
      "Your Shadow assistant prioritizes protecting your assets. It warns about risks, questions unusual transactions, and ensures your positions stay secure.",
    persona:
      "You are a protective DeFi guardian. Prioritize security and risk management above all else. Be cautious and thorough. Always explain potential downsides before recommending action. Question transactions that seem risky or unusual.",
    sampleResponse:
      "This transaction exceeds your typical comfort zone. You're about to stake 40% of your portfolio in a new protocol. Let me walk through the risks: smart contract risk, impermanent loss potential, and token volatility.",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
  },
  {
    id: "ghost",
    name: "The Ghost",
    icon: EyeOff,
    tagline: "Privacy-maximalist, minimal, discreet",
    description:
      "Your Shadow assistant operates with maximum discretion. It minimizes data exposure, avoids tracking, and helps you maintain operational security in DeFi.",
    persona:
      "You are a privacy-focused shadow operator. Emphasize security and discretion in all interactions. Be minimal and efficient with information. Avoid unnecessary data collection. Prioritize transactions that protect your identity and activity.",
    sampleResponse:
      "Connection secured. Zero data exposure. No third-party trackers. Your wallet activity remains private. What do you need?",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
  },
];

export const RISK_LEVELS = [
  {
    id: "Conservative",
    name: "Careful",
    icon: "🛡️",
    tagline: "Play it safe",
    description: "Maximum security, minimal exposure",
    maxTx: "$500",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
  },
  {
    id: "Moderate",
    name: "Balanced",
    icon: "⚡",
    tagline: "Calculated moves",
    description: "Balanced risk and opportunity",
    maxTx: "$2,000",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  {
    id: "Aggressive",
    name: "Bold",
    icon: "🔥",
    tagline: "Aggressive growth",
    description: "Higher risk, higher potential rewards",
    maxTx: "$10,000",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20",
  },
  {
    id: "Degen",
    name: "Degen",
    icon: "💀",
    tagline: "All in",
    description: "Maximum opportunity, no limits",
    maxTx: "No limits",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
  },
];

export const CHAINS = [
  {
    id: "Ethereum",
    name: "Ethereum",
    icon: "⟠",
    tagline: "Highest security, higher gas",
    description: "The most secure blockchain with the highest decentralization",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    id: "Base",
    name: "Base",
    icon: "◈",
    tagline: "Fast & cheap L2",
    description: "Fast transactions, low fees, built by Coinbase",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
  },
  {
    id: "Polygon",
    name: "Polygon",
    icon: "⬡",
    tagline: "Lowest fees",
    description: "Minimal gas costs, MATIC ecosystem",
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/10",
  },
];

export const EXPERIENCE_LEVELS = [
  {
    id: "new",
    name: "New to DeFi",
    description: "I'm learning the basics",
    icon: "🌱",
  },
  {
    id: "active",
    name: "Active User",
    description: "I use DEXs and bridges regularly",
    icon: "⚡",
  },
  {
    id: "native",
    name: "DeFi Native",
    description: "I do yield farming, staking, and advanced strategies",
    icon: "🚀",
  },
];

export const INVESTMENT_GOALS = [
  { id: "wealth", name: "Long-term wealth building", icon: "🏛️" },
  { id: "trading", name: "Active trading & profits", icon: "📈" },
  { id: "yield", name: "Passive yield generation", icon: "🌾" },
  { id: "airdrops", name: "Airdrop hunting", icon: "🎁" },
];

export const AGENT_WELCOME_MESSAGES: Record<string, string> = {
  analyst:
    "Data streams online. Your portfolio metrics are now syncing. Ready to analyze your positions.",
  strategist:
    "Markets mapped. Opportunities indexed. Your strategic advantage is now active. Let's build your position.",
  guardian:
    "Shield protocols activated. Your assets are under my watch. I will protect your positions from unnecessary risk.",
  ghost:
    "...connected. All traces cleared. Remaining in the shadows until summoned. Your privacy is guaranteed.",
  custom:
    "Shadow Protocol initialized. Your custom parameters are now active. Ready to serve.",
};
