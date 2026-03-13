/** Chat agent invoke types — must match Rust ChatAgentInput/ChatAgentResponse */

export type ChatMessage = {
  role: string;
  content: string;
};

export type ChatAgentInput = {
  model: string;
  messages: ChatMessage[];
  walletAddress?: string | null;
  walletAddresses?: string[] | null;
  numCtx?: number;
};

export type ResponseBlock =
  | { type: "text"; content: string }
  | { type: "toolResult"; toolName: string; content: string };

export type ChatAgentResponse =
  | {
      kind: "assistantMessage";
      content: string;
      blocks: ResponseBlock[];
    }
  | {
      kind: "approvalRequired";
      toolName: string;
      payload: SwapPreviewPayload;
      message: string;
    }
  | {
      kind: "error";
      message: string;
    };

export type SwapPreviewPayload = {
  fromToken: string;
  toToken: string;
  amount: string;
  estimatedOutput: string;
  chain: string;
  slippage: string;
  gasEstimate: string;
};

export type ApproveAgentActionInput = {
  toolName: string;
  payload: SwapPreviewPayload;
};

export type ApproveAgentActionResult = {
  success: boolean;
  message: string;
  txHash?: string | null;
};
