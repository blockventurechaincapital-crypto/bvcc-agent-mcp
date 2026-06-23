/**
 * BVCC Agent Wallet — MCP server.
 *
 * Exposes a BVCC Agent Wallet to MCP-speaking AI runtimes (Claude Code, Cursor,
 * the Claude app). Every tool is generated from the @bvcc/agent-sdk capability
 * catalog — there is no per-tool code here. Add a capability to the SDK catalog
 * and it shows up here automatically.
 *
 * Security: this server adds NO powers. All limits (spend caps, allowed tokens,
 * allowed protocols, recipient whitelist, pause) are enforced on-chain by the
 * Agent Wallet contract. The agent's private key is read from the environment,
 * used locally to sign, and never transmitted. Set BVCC_MCP_READONLY=true to
 * expose only read/simulate tools (no fund-moving writes).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CATALOG,
  type Capability,
  type CapabilityKind,
} from "@bvcc/agent-sdk/catalog";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { loadConfig } from "./env.js";
import { loadEnvFile } from "./loadEnv.js";
import { createClientFactory, resolveChainId, rpcUrlsFor, SUPPORTED_NETWORKS } from "./clients.js";
import { stringify, toJsonSafe } from "./json.js";
import { redactSecrets } from "./redact.js";

const PKG_VERSION = "0.1.0";

const INSTRUCTIONS = `This server operates a BVCC Agent Wallet on-chain.

WORKFLOW (do this in order):
1. Call getAgentStatus / getCapabilities first to learn what this agent may do
   (authorized? expired? paused? which tokens/protocols/recipients allowed?).
2. Check balances (getNativeBalance / getTokenBalances) and headroom (getRemaining).
3. For swaps, call buildSwapPlan (quote:true) to get amountOutMinimum and any
   warnings BEFORE swapping. Never swap with amountOutMinimum '0'.
4. Prefer a dryRun* tool to preview a write (gas + revert reason) before sending.
5. Then call the write tool (sendNative/sendToken/approve/swapV3/swapV4).

KEY FACTS:
- This server is multi-network. Every tool takes an optional "network" (a chain id
  like 42161 or a name: ethereum, bsc, arbitrum, base, arbitrum-sepolia). Omit it to
  use the server's default chain. The same wallet address exists on every chain, but
  the agent must be authorized on the chain you target or the action reverts.
- Amounts are human decimal strings ("0.1"); tokens are symbols ("USDC") or 0x addresses.
- The contract enforces every limit. A blocked action reverts on-chain — read the
  returned humanMessage/suggestedAction and adjust; do not retry blindly.
- write tools move funds (annotated destructive). read/simulate tools do not.`;

/** Map a catalog kind to MCP tool annotations so clients can render/gate by class. */
function annotationsFor(cap: Capability<never>): ToolAnnotations {
  const base: ToolAnnotations = { title: cap.title };
  switch (cap.kind) {
    case "read":
      return { ...base, readOnlyHint: true, openWorldHint: true };
    case "simulate":
      // Simulations don't broadcast, but they read live chain state.
      return { ...base, readOnlyHint: true, openWorldHint: true };
    case "write":
      return {
        ...base,
        readOnlyHint: false,
        destructiveHint: true, // moves funds
        idempotentHint: false,
        openWorldHint: true,
      };
  }
}

/**
 * Optional per-call network selector, added to every tool. Lets one server
 * operate the agent on any supported chain (default: the server's CHAIN_ID).
 */
const networkParam = z
  .union([z.string(), z.number().int()])
  .optional()
  .describe(
    `Target network: a chain id (e.g. 42161) or name (${SUPPORTED_NETWORKS}). ` +
      "Defaults to the server's CHAIN_ID. The agent must be authorized on that chain.",
  );

/** The raw Zod shape MCP wants, plus the shared `network` selector. Every catalog
 * entry uses z.object(...). */
function rawShape(cap: Capability<never>): z.ZodRawShape {
  const params = cap.params as unknown as { shape?: z.ZodRawShape };
  if (!params.shape) {
    throw new Error(`Capability "${cap.id}" params must be a z.object (got no .shape).`);
  }
  return { ...params.shape, network: networkParam };
}

function kindLabel(kind: CapabilityKind): string {
  return kind === "write" ? "🔴 write" : kind === "simulate" ? "🟡 simulate" : "🟢 read";
}

async function main(): Promise<void> {
  // Fill missing env from an optional .env file (BVCC_ENV_FILE or ./.env) BEFORE
  // reading config. Vars already set by the host win. Lets the agent key live in
  // a dedicated chmod-600 file instead of inline in the MCP host config.
  loadEnvFile();
  const config = loadConfig();

  // One factory, one client per chain (lazy + cached). Each tool can target a
  // network per call; the default chain is config.chainId. Build the default now
  // so a bad CHAIN_ID / RPC fails fast and the banner can report the agent.
  const getClient = createClientFactory(config);
  const defaultClient = getClient(config.chainId);

  const server = new McpServer(
    { name: "bvcc-agent-wallet", version: PKG_VERSION },
    { instructions: INSTRUCTIONS },
  );

  const exposed = config.readOnly ? CATALOG.filter((c) => c.kind !== "write") : CATALOG;

  for (const cap of exposed) {
    server.registerTool(
      cap.id,
      {
        title: cap.title,
        description: `[${kindLabel(cap.kind)}] ${cap.description}`,
        inputSchema: rawShape(cap),
        annotations: annotationsFor(cap),
      },
      async (args: unknown) => {
        try {
          // Pull the per-call network selector out before handing args to the
          // catalog (its schema doesn't include `network`); route to that chain.
          const { network, ...rest } = (args ?? {}) as Record<string, unknown>;
          const chainId = resolveChainId(network as string | number | undefined, config.chainId);
          const client = getClient(chainId);
          const result = await cap.invoke(client, rest as never);
          return {
            content: [{ type: "text", text: stringify(result) }],
            structuredContent: { result: toJsonSafe(result) },
          };
        } catch (err) {
          // Redact RPC URLs (which may embed an API key) before returning the
          // message to the model/client.
          const message = redactSecrets(err instanceof Error ? err.message : String(err));
          return {
            isError: true,
            content: [{ type: "text", text: `Error in ${cap.id}: ${message}` }],
          };
        }
      },
    );
  }

  // Startup diagnostics go to stderr — stdout is reserved for the MCP protocol.
  const rpcCount = rpcUrlsFor(config.chainId, config).length;
  console.error(
    `[bvcc-agent-mcp v${PKG_VERSION}] wallet=${config.walletAddress} ` +
      `agent=${defaultClient.agentAddress} chain=${config.chainId} (default, multi-network) ` +
      `rpcs=${rpcCount}${rpcCount > 1 ? " (failover)" : ""} ` +
      `mode=${config.readOnly ? "read-only" : "full"} tools=${exposed.length}`,
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(
    `[bvcc-agent-mcp] fatal: ${redactSecrets(err instanceof Error ? err.message : String(err))}`,
  );
  process.exit(1);
});
