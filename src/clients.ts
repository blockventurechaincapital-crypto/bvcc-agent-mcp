import { fallback, http } from "viem";
import { BvccAgentClient, NETWORKS } from "@bvcc/agent-sdk";
import type { ServerConfig } from "./env.js";

/**
 * Multi-network routing for one MCP server.
 *
 * A single server can operate the agent on any supported chain: each tool takes
 * an optional `network`, defaulting to the server's CHAIN_ID. The wallet address
 * is the SAME on every chain (CREATE2), so only the chain id and RPC change. The
 * same agent key is reused — it must be authorized on each chain you target, or
 * the contract reverts (NotAuthorizedAgent). Clients are created lazily and
 * cached per chain.
 *
 * Per-chain RPC: the default chain uses `RPC_URL`; any other chain uses
 * `RPC_URL_<chainId>`. Each may list SEVERAL URLs separated by commas — they're
 * wired into a viem `fallback` transport so a downed RPC fails over to the next
 * (priority = order). The chain's public default is appended last as a safety
 * net, so a bot keeps running even if your RPCs are all unreachable.
 */

/**
 * Extra public RPCs appended per chain (after the SDK default) so each chain has
 * built-in failover without any config. PublicNode — no API key, reliable.
 */
const EXTRA_PUBLIC_RPCS: Record<number, string[]> = {
  1: ["https://eth.drpc.org"], // Ethereum (secondary; primary is publicnode in the SDK default)
  56: ["https://bsc-rpc.publicnode.com"], // BNB Chain
  42161: ["https://arbitrum-one-rpc.publicnode.com"], // Arbitrum One
  8453: ["https://base-rpc.publicnode.com"], // Base
};

/** Friendly network names → chain id. Numeric ids are also accepted directly. */
const NAME_TO_CHAIN: Record<string, number> = {
  ethereum: 1,
  eth: 1,
  mainnet: 1,
  bsc: 56,
  bnb: 56,
  "bnb-chain": 56,
  binance: 56,
  arbitrum: 42161,
  "arbitrum-one": 42161,
  arb: 42161,
  base: 8453,
  polygon: 137,
  matic: 137,
  pol: 137,
  "arbitrum-sepolia": 421614,
  "arb-sepolia": 421614,
  sepolia: 421614,
};

/** Names of the supported networks, for tool descriptions / error messages. */
export const SUPPORTED_NETWORKS = "ethereum, bsc, arbitrum, base, polygon, arbitrum-sepolia";

/**
 * Resolve a `network` arg (chain id number, numeric string, or friendly name) to
 * a known chain id. `undefined` → the server default. Throws on anything not
 * supported, with an actionable message.
 */
export function resolveChainId(
  network: string | number | undefined,
  fallbackChainId: number,
): number {
  if (network == null || network === "") return fallbackChainId;

  let id: number | undefined;
  if (typeof network === "number") {
    id = network;
  } else {
    const s = network.trim().toLowerCase();
    id = /^\d+$/.test(s) ? Number(s) : NAME_TO_CHAIN[s];
  }

  if (id == null || !NETWORKS[id]) {
    throw new Error(
      `Unknown network "${network}". Use a chain id or one of: ${SUPPORTED_NETWORKS}.`,
    );
  }
  return id;
}

/** Split a comma/whitespace-separated RPC list into trimmed, non-empty URLs. */
function splitUrls(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

/**
 * Resolve the ordered RPC list for a chain: configured URLs first (priority by
 * order), then the chain's public default as a last-resort fallback. Always
 * returns at least one URL.
 */
export function rpcUrlsFor(
  chainId: number,
  config: ServerConfig,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const urls: string[] = [];
  if (chainId === config.chainId) urls.push(...splitUrls(config.rpcUrl));
  urls.push(...splitUrls(env[`RPC_URL_${chainId}`]));
  const fallbackDefault = NETWORKS[chainId]?.rpcUrl;
  if (fallbackDefault) urls.push(fallbackDefault);
  urls.push(...(EXTRA_PUBLIC_RPCS[chainId] ?? []));
  return [...new Set(urls)];
}

/** A function that returns a cached client for a given chain id. */
export type ClientFactory = (chainId: number) => BvccAgentClient;

/**
 * Build a lazy, per-chain client factory. The same key + wallet address are used
 * on every chain; each chain gets a `fallback` transport over its resolved RPC
 * list so a single downed RPC doesn't stop the agent (see module docs).
 */
export function createClientFactory(
  config: ServerConfig,
  env: NodeJS.ProcessEnv = process.env,
): ClientFactory {
  const cache = new Map<number, BvccAgentClient>();
  return (chainId: number): BvccAgentClient => {
    let client = cache.get(chainId);
    if (!client) {
      const urls = rpcUrlsFor(chainId, config, env);
      const transport =
        urls.length > 1 ? fallback(urls.map((u) => http(u))) : http(urls[0]);
      client = new BvccAgentClient({
        account: config.agentPrivateKey,
        walletAddress: config.walletAddress,
        network: chainId,
        transport,
      });
      cache.set(chainId, client);
    }
    return client;
  };
}
