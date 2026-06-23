# Operating guide — BVCC Agent Wallet MCP

This is the "how to drive it well" layer that lives in the MCP (separate from the
SDK). The per-tool descriptions tell the model *what* each tool is; this guide
tells it *how* to combine them safely.

## Mental model

The agent is a normal EOA that signs `executeAsAgent(...)` and pays its own gas.
**Every limit is enforced on-chain** by the BVCC Agent Wallet contract: spend
caps (native + per-token, daily + total), allowed tokens, allowed protocols, an
optional recipient whitelist, and a global pause. This MCP adds no powers — the
worst any tool can do is bounded by what the user authorized for this agent.

A blocked action does not fail silently: the contract reverts and the SDK returns
a structured failure with `errorName`, `humanMessage`, and `suggestedAction`.
Read those and adjust — do **not** retry the same call blindly.

## Tool classes (from the SDK catalog `kind`)

- 🟢 **read** — pure on-chain reads. No transaction. Safe to call freely.
- 🟡 **simulate** — preview a write (gas estimate + revert reason) without sending.
- 🔴 **write** — broadcasts a transaction and **moves funds**. Annotated
  `destructiveHint` so clients can ask the user to confirm.

Run the server with `BVCC_MCP_READONLY=true` to expose only 🟢/🟡 (e.g. a
monitoring assistant that must never move funds).

## Recommended workflow

1. **Orient.** `getAgentStatus` and `getCapabilities` — is the agent active, not
   expired, not paused? Which tokens/protocols/recipients are allowed?
2. **Check funds.** `getNativeBalance`, `getTokenBalances`, and `getRemaining`
   (spend headroom; a `null` field means that limit is unlimited/disabled).
3. **Plan swaps.** `buildSwapPlan` with `quote: true` to fill `amountOutMinimum`
   from the on-chain quoter and surface warnings. **Never** swap with
   `amountOutMinimum: "0"` — that disables slippage protection.
4. **Preview.** Use a `dryRun*` tool to estimate gas and catch a revert before
   spending real gas.
5. **Execute.** Call the matching write tool.

## Networks

This server is **multi-network**. Every tool takes an optional `network` (a chain
id like `42161`, or a name: `ethereum`, `bsc`, `arbitrum`, `base`,
`arbitrum-sepolia`). Omit it to use the server's `CHAIN_ID`. So you can say
"check the balance on bsc, then swap on arbitrum" against one server.

- The wallet address is the **same on every chain** (CREATE2). Only the chain and
  RPC change.
- The agent must be **authorized on each chain** you target — otherwise the action
  reverts with `NotAuthorizedAgent`. Authorize it per chain from the dashboard.
- RPC per chain: `RPC_URL` is the default chain's RPC; `RPC_URL_<chainId>` overrides
  a specific chain; otherwise a public default is used.
- **RPC failover:** each RPC variable may list several URLs separated by commas.
  They feed a viem `fallback` transport (tried in order; a downed RPC fails over to
  the next), and the chain's public default is appended last as a safety net — so an
  always-on bot keeps signing even if your primary RPC drops. The startup banner
  shows `rpcs=N (failover)`.

## Conventions

- **Amounts** are human-readable decimal strings: `"0.1"`, not wei. The server
  resolves token decimals for you.
- **Tokens** are symbols (`"USDC"`, `"WETH"`) or `0x` addresses. Unknown symbols
  error — pass an address instead.
- **Swap outputs** (`amountOutMinimum`) are in `tokenOut` units.

## Swap notes

- **v3** (`swapV3`) routes through SwapRouter02. Requires that router in
  `allowedProtocols` and `tokenIn` in `allowedTokens`.
- **v4** (`swapV4`) routes through the Universal Router with Permit2 — it needs
  **both** the Universal Router and Permit2 in `allowedProtocols`. v4 pools are
  identified by `fee` + `tickSpacing` (e.g. the Arbitrum USDC/WETH 0.05% pool is
  `fee: 500, tickSpacing: 10`).
- A wrong router address reverts rather than losing funds (no transfer-to-router).

## Where to keep the agent key

The key is read from the process environment. You can either set it inline in the
MCP host config's `env` block, or — **recommended** — keep it in a dedicated file
and point the server at it with `BVCC_ENV_FILE=/abs/path/agent.env`:

- Host configs get shared, synced and screenshotted while you troubleshoot. A
  dedicated, gitignored env file keeps the secret out of all that.
- `chmod 600 agent.env` and store it **outside** any cloud-synced folder
  (OneDrive/Dropbox/iCloud).
- Variables already set by the host **win** over the file — the file only fills
  what the host didn't set.
- This is not encryption: the file is still plaintext on disk. It reduces the
  accidental-leak surface, not the at-rest exposure. The real protection is the
  agent's tight on-chain limits — keep them narrow so a leaked key is worth little.

This is the agent EOA key (low-privilege, bounded by on-chain limits), never your
wallet owner key. Fund the agent EOA with only minimal gas; the funds live in the
smart wallet, which the agent can only touch within its authorized limits.

## Safety reminders

- The agent's private key is read from the environment, used locally to sign, and
  **never transmitted**. BVCC does not receive, store, or custody it.
- If an action is denied, the limit is intentional. Surface the `humanMessage`
  to the user instead of trying to work around it.
