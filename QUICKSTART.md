# Quickstart — BVCC Agent Wallet MCP

Get an AI runtime (Claude Code, Cursor, the Claude app, LM Studio) operating your
BVCC Agent Wallet, end to end. Two of these steps are easy to miss and the agent
does **nothing** without them — they're marked ⚠️.

You do **not** install `@bvcc/agent-sdk` separately. The MCP bundles it. The SDK is
only for building your own bot in code.

---

## A. On-chain setup (once)

### 1. Create the Agent Wallet
Create it from the BVCC dashboard. Note its **`WALLET_ADDRESS`** — it's the **same on
every chain** (deterministic CREATE2).

### 2. Generate a dedicated agent EOA
The agent is its own keypair — never your wallet owner key. Generate one:

```bash
cast wallet new        # foundry; or any wallet / viem generatePrivateKey()
```

Keep the **private key** (goes in the MCP config) and the **public address** (you
authorize it next).

### 3. ⚠️ Authorize the agent on-chain — with limits
In the dashboard, authorize the agent **address** on **each chain** you'll use, and
set its limits:

- **allowedTokens** — which ERC-20s it may touch.
- **allowedProtocols** — for swaps, the router **and** Permit2 (v4/Universal Router
  need both).
- **allowedRecipients** — optional whitelist of where funds may go.
- **spend caps** — per-tx, daily, period and total (native + per-token).
- **expiry** — optional auto-expiry.

Without this the contract reverts with `NotAuthorizedAgent`. Keep limits **tight** —
a leaked agent key is only worth what you authorized.

### 4. ⚠️ Fund the agent EOA with gas
The agent pays its **own gas** to sign `executeAsAgent`. Send a small amount of the
native token (ETH/BNB) to the **agent EOA address** on each chain. The funds it
*operates* live in the wallet — the EOA only needs gas.

---

## B. Install & configure the MCP

### 5. Configuration
Provide these as environment variables. **Recommended:** keep them in a dedicated
file and point the server at it with `BVCC_ENV_FILE`, so the key stays out of the
host config (which gets shared/synced). `chmod 600` it and keep it out of any
cloud-synced folder.

| Variable | Required | What it is |
|----------|:---:|------------|
| `AGENT_PRIVATE_KEY` | ✅ | The agent EOA private key from step 2 (`0x` + 64 hex). |
| `WALLET_ADDRESS` | ✅ | The Agent Wallet from step 1. |
| `CHAIN_ID` | ✅ | Default chain: `1` Ethereum · `56` BNB · `42161` Arbitrum One · `8453` Base · `421614` Arbitrum Sepolia. |
| `RPC_URL` / `RPC_URL_<chainId>` | ❌ | Your own RPC(s). Comma-separate several for failover. Else public defaults are used. |
| `BVCC_MCP_READONLY` | ❌ | `true` exposes only read/simulate tools (never moves funds). |

Example `agent.env`:

```bash
AGENT_PRIVATE_KEY=0xYOUR_AGENT_KEY
WALLET_ADDRESS=0xYOUR_WALLET
CHAIN_ID=42161
# optional failover:
# RPC_URL_42161=https://arb1.arbitrum.io/rpc,https://arbitrum-one-rpc.publicnode.com
```

This server is **multi-network**: every tool takes an optional `network` (chain id or
name), so you can say "swap on bsc" without restarting — provided the agent is
authorized on that chain (step 3). The 4 mainnets ship with a backup public RPC, so
basic failover works with zero config.

### 6. Register it

**Claude Code:**
```bash
claude mcp add bvcc-agent-wallet \
  --env BVCC_ENV_FILE=/secure/agent.env \
  -- npx -y @bvcc/agent-mcp
```

**Cursor / Claude app / LM Studio (`mcp.json`):**
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

(You can also put `AGENT_PRIVATE_KEY` / `WALLET_ADDRESS` / `CHAIN_ID` directly in the
`env` block instead of `BVCC_ENV_FILE`.)

### 7. Verify
Restart the client and ask the model to **check the agent status**. It calls
`getAgentStatus`; you want:

- `isAuthorized: true` (step 3 done)
- `isPaused: false`
- the expected `allowedTokens` / `allowedProtocols`

Then try a read (`getTokenBalances`), a plan (`buildSwapPlan` with `quote: true`), and
finally a write. Good first prompt:

> Check the agent status and my balances, then swap 10 USDC to WBTC with 1% slippage.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `NotAuthorizedAgent` | Agent not authorized on this chain | Authorize the agent address on that chain (step 3). |
| Tx fails / "out of funds for gas" | Agent EOA has no native balance | Send gas to the agent EOA (step 4). |
| `TokenNotAllowed` / `ProtocolNotAllowed` | Token/router not whitelisted | Add it to allowedTokens/allowedProtocols. |
| `EnforcedPause` | Agents paused on the wallet | Unpause from the dashboard. |
| Action on the wrong chain | `network` omitted / wrong | Pass `network` explicitly, or set `CHAIN_ID`. |
| Server won't start | Missing/!valid env var | The startup error lists exactly what's missing. |

The contract is the source of truth: a blocked action reverts and the tool returns a
`humanMessage` + `suggestedAction`. Read those instead of retrying blindly.
