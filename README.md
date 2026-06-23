<p align="center">
  <img src="https://raw.githubusercontent.com/blockventurechaincapital-crypto/bvcc-agent-mcp/main/assets/bvcc_wallet.png" alt="BVCC Wallet" width="180" />
</p>

# @bvcc/agent-mcp

**Model Context Protocol server for a BVCC Agent Wallet.** It lets MCP-speaking
AI runtimes — Claude Code, Cursor, the Claude desktop app — operate a BVCC Agent
Wallet on-chain: check balances and limits, plan and simulate swaps, send tokens,
and swap on Uniswap v3/v4.

Every tool is generated from the [`@bvcc/agent-sdk`](https://www.npmjs.com/package/@bvcc/agent-sdk) capability
catalog. There is no per-tool code here: add a capability to the SDK catalog and
it appears here automatically.

> **New here? Start with [QUICKSTART.md](https://github.com/blockventurechaincapital-crypto/bvcc-agent-mcp/blob/main/QUICKSTART.md)** — the full end-to-end
> setup (create wallet → authorize the agent on-chain → fund it with gas → configure
> → verify). It covers the two steps people miss without which the agent does nothing.

## Security

This server **adds no powers**. All limits — spend caps (native + per-token,
daily + total), allowed tokens, allowed protocols, recipient whitelist, and a
global pause — are enforced **on-chain** by the Agent Wallet contract. The worst
any tool can do is bounded by what you authorized for the agent in the BVCC
dashboard.

- The agent's **private key** is read from the environment, used locally to sign,
  and **never transmitted**. BVCC does not receive, store, or custody it.
- Tools are exposed **explicitly** via the SDK catalog — nothing is auto-discovered.
- Set `BVCC_MCP_READONLY=true` to expose only read/simulate tools (no writes).

## Tools

Generated from the catalog and tagged by class:

| Class | Tools |
|-------|-------|
| 🟢 read | `getAgentStatus`, `getCapabilities`, `getNativeBalance`, `getTokenBalances`, `getRemaining`, `needsApproval` |
| 🟡 simulate | `buildSwapPlan`, `dryRunSendNative`, `dryRunSendToken`, `dryRunSwapV3`, `dryRunSwapV4` |
| 🔴 write | `sendNative`, `sendToken`, `approve`, `swapV3`, `swapV4` |

Writes carry the MCP `destructiveHint` annotation so clients can require
confirmation. See [GUIDE.md](https://github.com/blockventurechaincapital-crypto/bvcc-agent-mcp/blob/main/GUIDE.md) for the recommended operating workflow.

## Configuration

**Recommended:** keep the values — above all `AGENT_PRIVATE_KEY` — in a dedicated
env file and point the server at it with `BVCC_ENV_FILE`, instead of inlining the
key in your MCP host's config (which gets shared, synced and screenshotted).
`chmod 600` that file and keep it outside any cloud-synced folder. You *can* still
inline the variables in the host's `env` block if you prefer; host env wins over
the file. See [`.env.example`](https://github.com/blockventurechaincapital-crypto/bvcc-agent-mcp/blob/main/.env.example).

Example `agent.env` (path passed via `BVCC_ENV_FILE`):

```bash
AGENT_PRIVATE_KEY=0xYOUR_AGENT_KEY
WALLET_ADDRESS=0xYOUR_WALLET
CHAIN_ID=42161
```

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENT_PRIVATE_KEY` | yes | Agent EOA private key (`0x` + 64 hex). Used locally only. |
| `WALLET_ADDRESS` | yes | The BVCC Agent Wallet this agent operates. |
| `CHAIN_ID` | yes | **Default** chain: `42161` Arbitrum One · `56` BNB · `1` Ethereum · `8453` Base · `421614` Arbitrum Sepolia. |
| `RPC_URL` | no | Custom RPC for the default chain (otherwise a public default). |
| `RPC_URL_<chainId>` | no | Per-chain RPC override, e.g. `RPC_URL_56`. |
| `BVCC_ENV_FILE` | no | Path to a dedicated env file to load (keeps the key out of the host config). Host env wins over it. |
| `BVCC_MCP_READONLY` | no | `true` exposes only read/simulate tools. |

**Multi-network:** one server operates the agent on any supported chain. Every
tool takes an optional `network` (chain id or name: `ethereum`, `bsc`, `arbitrum`,
`base`, `arbitrum-sepolia`), defaulting to `CHAIN_ID` — so you can say "swap on
bsc" without restarting. The wallet address is the same on every chain (CREATE2);
the agent must be authorized on each chain you use.

## Install & build

```bash
npm install
npm run build
npm test          # builds + stdio smoke test (no chain calls)
```

## Connect to a client

### Claude Code

```bash
claude mcp add bvcc-agent-wallet \
  --env BVCC_ENV_FILE=/secure/agent.env \
  -- npx -y @bvcc/agent-mcp
```

### Cursor / Claude app (`mcp.json`)

```json
{
  "mcpServers": {
    "bvcc-agent-wallet": {
      "command": "npx",
      "args": ["-y", "@bvcc/agent-mcp"],
      "env": { "BVCC_ENV_FILE": "/secure/agent.env" }
    }
  }
}
```

The key lives in `agent.env`, not in the config above. If you'd rather inline it,
replace the `env` block with `AGENT_PRIVATE_KEY` / `WALLET_ADDRESS` / `CHAIN_ID`
directly (less safe — the key sits in the host config). Pin a version for
reproducibility, e.g. `@bvcc/agent-mcp@0.1.1` (see [Upgrading](#upgrading)).

## Upgrading

The SDK is bundled into this package, so **updating the MCP is all you need** to get
new capabilities (e.g. a future Aave release) — you never install or update
`@bvcc/agent-sdk` separately.

1. **Pin the version** in your config for reproducibility:
   ```json
   "args": ["-y", "@bvcc/agent-mcp@0.1.0"]
   ```
   `npx` caches, so an unpinned `@bvcc/agent-mcp` can keep running an old build.
   To upgrade, bump the number (e.g. `@0.2.0`) — or use `@latest` if you prefer.
   Global installs: `npm i -g @bvcc/agent-mcp@latest`.
2. **Restart your MCP client.** New tools from the catalog appear automatically;
   nothing else in the config changes. The startup banner prints the running
   version (`[bvcc-agent-mcp vX.Y.Z]`).
3. ⚠️ **Authorize any new protocol on-chain.** A release that adds a new protocol
   (e.g. Aave) exposes its tools immediately, but the agent must have that
   protocol's contract in its `allowedProtocols` — otherwise the action reverts
   with `ProtocolNotAllowed`. Authorize it from the dashboard, same as a router.

See [CHANGELOG.md](https://github.com/blockventurechaincapital-crypto/bvcc-agent-mcp/blob/main/CHANGELOG.md) for what each version changes. Versioning follows
SemVer: patch = fix, minor = new compatible feature, and `0.x` means the API may
still change.

## How it works

```
@bvcc/agent-sdk  ──catalog──►  @bvcc/agent-mcp  ──MCP──►  Claude Code / Cursor / Claude
   (on-chain limits live in the Agent Wallet contract, not here)
```

The server loads the catalog, registers one MCP tool per capability (Zod schema →
tool input schema, `kind` → tool annotations), and routes each call to the SDK,
which signs with the agent key and submits `executeAsAgent`.

## License

MIT © BlockVenture Chain Capital (BVCC)
