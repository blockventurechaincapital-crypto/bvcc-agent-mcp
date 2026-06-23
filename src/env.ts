import type { Address, Hex } from "viem";
import { NETWORKS } from "@bvcc/agent-sdk";

/** Resolved server configuration from environment variables. */
export interface ServerConfig {
  /** Agent EOA private key (0x…). Used locally to sign; never transmitted. */
  agentPrivateKey: Hex;
  /** The BVCC Agent Wallet this agent operates. */
  walletAddress: Address;
  /** Chain id (e.g. 42161 Arbitrum One). */
  chainId: number;
  /** Optional custom RPC URL. */
  rpcUrl?: string;
  /** When true, only `read` and `simulate` tools are exposed (no writes). */
  readOnly: boolean;
}

function truthy(v: string | undefined): boolean {
  return v === "1" || v?.toLowerCase() === "true" || v?.toLowerCase() === "yes";
}

/**
 * Read and validate configuration. Throws with an actionable message listing
 * exactly what is missing — the server should refuse to start without a wallet.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const missing: string[] = [];

  const agentPrivateKey = env.AGENT_PRIVATE_KEY?.trim();
  const walletAddress = env.WALLET_ADDRESS?.trim();
  const chainIdRaw = env.CHAIN_ID?.trim();

  if (!agentPrivateKey) missing.push("AGENT_PRIVATE_KEY (the agent EOA private key, 0x…)");
  if (!walletAddress) missing.push("WALLET_ADDRESS (the BVCC Agent Wallet address)");
  if (!chainIdRaw) missing.push("CHAIN_ID (e.g. 42161 for Arbitrum One)");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n  - ${missing.join("\n  - ")}\n\n` +
        "Set them in your MCP client config (env block) or shell before launching.",
    );
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(agentPrivateKey!)) {
    throw new Error("AGENT_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string.");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress!)) {
    throw new Error("WALLET_ADDRESS must be a 0x-prefixed 20-byte address.");
  }
  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`CHAIN_ID must be a positive integer, got "${chainIdRaw}".`);
  }
  if (!NETWORKS[chainId]) {
    const supported = Object.keys(NETWORKS).join(", ");
    throw new Error(
      `CHAIN_ID ${chainId} is not a supported BVCC network. Supported chain ids: ${supported}.`,
    );
  }

  return {
    agentPrivateKey: agentPrivateKey as Hex,
    walletAddress: walletAddress as Address,
    chainId,
    rpcUrl: env.RPC_URL?.trim() || undefined,
    readOnly: truthy(env.BVCC_MCP_READONLY),
  };
}
