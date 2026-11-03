# Changelog

All notable changes to `@bvcc/agent-mcp` are documented here. This project follows
[Semantic Versioning](https://semver.org/). While on `0.x`, behavior may change
between minor versions.

The SDK is bundled into this package, so updating the MCP is all a tool user needs
to get new capabilities (e.g. a future Aave release) — see **Upgrading** in the
README.

## [0.3.0] — 2026-11-03

Bundles `@bvcc/agent-sdk` 0.3.0: **wallet V5 support**. Wallets of earlier generations
behave as before; the server finds out which generation each wallet is by itself.

### Added
- **Wallet V5.** Status, capabilities and remaining-budget tools read V5 permissions with
  their meaning: a limit of 0 allows nothing (shown as "not allowed", no longer as
  "unlimited"), an empty recipient list allows no recipient, and the agent can be paused
  on its own. Capabilities check this agent's call policies, the active validators, the
  contracts the owner blocked and the owner's Permit2 allowances.
- On V5, swap and liquidity tools leave out the Permit2 steps (the owner grants them),
  `swapV3` runs through the Universal Router, and `aaveRepayWithATokens`, which V5 does
  not allow, returns a plain explanation before any gas is spent. Native-coin swaps and
  Uniswap v3 liquidity depend on their validators (see below). The descriptions say so.
- Router deadlines follow the chain's clock: a swap no longer fails with
  `TransactionDeadlinePassed` when the computer's clock is behind.
- Readable messages for the new V5, Permit2 and Uniswap router errors.
- The server instructions describe the V5 rules.
- On V5, Uniswap v3 liquidity and native-coin swaps work where their validators are active
  (`getCapabilities` → `canProvideLiquidityV3`, `canWrapNative`); elsewhere they explain that
  they are not active yet on that network.
- Transactions are sent with a 20% gas margin over the estimate (no more out-of-gas on
  valid LP operations).
- Failures carry `retryable`; the instructions tell the agent not to repeat a call that
  returned `retryable: false`. Uniswap `STF` and Aave error codes are explained.
- Liquidity tools take `priceLower` / `priceUpper` and ask for confirmation before
  opening a range outside the current price (`allowOutOfRange: true` opens it).
- Whole-balance sends on V5 are refused before any gas, with the most that can be moved.
- Transactions end with an 8-byte tag naming the tool (MCP) and its version — nothing
  about the user or the wallet.

## [0.2.2] — 2026-07-30

### Fixed
- **The server reported the wrong version.** `serverInfo.version` in the MCP handshake —
  what your client shows and what the startup banner prints — was a literal in
  `server.ts` last updated for 0.1.6, so 0.2.0 and 0.2.1 both announced themselves as
  `0.1.6`. Nothing behaved differently, but anyone checking their version saw a stale one
  and had reason to think `npx` was serving an old build. The version is now injected at
  build time from `package.json` and cannot drift again.
- **The MCP registry entry pinned 0.2.0.** `server.json` named 0.2.0 as the npm version to
  install, so anyone arriving through the registry got a build with no wallet V4 support —
  no `walletVersion: "v4"` from `getCapabilities`, no V4 call-policy checks, and raw
  selectors instead of an actionable `AgentMustBeEOA`. Installing with
  `npx -y @bvcc/agent-mcp` was never affected; it resolves to `latest`.

No tool signatures changed and no behaviour changed. Bundles `@bvcc/agent-sdk` 0.2.2,
which is itself a maintenance release identical in behaviour to 0.2.1 — the version
numbers are aligned so that the SDK inside a given MCP build is obvious.

## [0.2.1] — 2026-07-28

### Changed
- Bundles `@bvcc/agent-sdk` 0.2.1, which brings wallet V4 support: `getCapabilities`
  reports `walletVersion: "v4"`, the call-policy checks apply to V4 wallets, and the three
  V4 reverts come back as actionable messages instead of raw selectors — in particular
  `AgentMustBeEOA`, which an agent hits permanently if its address acquires an EIP-7702
  delegation.
- No tool signatures changed. Nothing to reconfigure: the MCP targets a wallet address,
  not a factory.

## [0.2.0] — 2026-07-21

### Added
- **Aave v3 lending tools** (Arbitrum): `getAavePositions`, `getAaveMarket`,
  `aaveSupply`, `aaveWithdraw`, `aaveBorrow`, `aaveRepay`, `aaveRepayWithATokens`,
  `aaveSetCollateral`, `aaveSetEMode`, plus `dryRunAaveSupply` / `dryRunAaveBorrow`.
  Deposits/borrows are always for the wallet itself (pinned by the wallet's call
  policies); `"max"` withdraws/repays the full balance/debt.
- **Wallet V3 support** via `@bvcc/agent-sdk` 0.2.0. `getCapabilities` no longer
  reports a swap as possible when the wallet is missing the required call policy, and
  policy reverts now come back with actionable messages instead of raw selectors.
- **Aave planners**: `aavePlanClosePosition` / `aaveClosePosition`, `aavePlanDeleverage` /
  `aaveDeleverage`, `aavePlanCollateralSwap` / `aaveCollateralSwap`, `aavePlanDebtSwap` /
  `aaveDebtSwap`. The execute half runs a chunked loop and **may send several
  transactions in one call**; each chunk is re-derived from live state and simulated
  before it is sent, and aborts on a health-factor floor, price impact, lack of
  progress or budget.
- **Native ETH swaps**: `swapToNative` and `swapFromNative` as BVCC's own batches; the 0.15% agent fee applies.
- **`BVCC_MCP_MODULES`**: expose only the feature groups you want (`core`, `aave`).
  Combines with `BVCC_MCP_READONLY`. An unknown name yields a smaller surface, never
  a larger one.

### Notes
- Bundles `@bvcc/agent-sdk` 0.2.0. Tools are generated from the SDK catalog, so no
  per-tool code changed here — the Aave tools appear automatically.
- Aave is Arbitrum-only in this release; the lending tools return a clear error on
  other chains.

## [0.1.6] — 2026-06-29

### Added
- **Polygon** support (chain id `137`; names `polygon` | `matic` | `pol`). Bundles
  `@bvcc/agent-sdk` 0.1.4. Supported networks are now ethereum, bsc, arbitrum, base,
  polygon and arbitrum-sepolia.

## [0.1.5] — 2026-06-28

### Added
- Onboarding guidance: server `INSTRUCTIONS` now include a SETUP section, and
  `getAgentStatus` returns a `suggestedAction` pointing to
  `https://bvccwallet.blockventurechaincapital.com` when the agent is not yet
  authorized (bundles `@bvcc/agent-sdk` 0.1.3).

## [0.1.4] — 2026-06-28

### Added
- `mcpName` field in `package.json` and a `server.json` manifest to publish the
  server in the official MCP Registry (`registry.modelcontextprotocol.io`), under
  the `com.blockventurechaincapital/bvcc-agent-wallet` namespace.

## [0.1.2] — 2026-06-23

### Changed
- Bundles `@bvcc/agent-sdk` 0.1.2: the `getNativeBalance` and `getTokenBalances`
  tools now return a `formatted` amount that includes the token symbol
  (e.g. `"0.1951 USDC"`), so small models stop misreading the raw base-unit field.

## [0.1.1] — 2026-06-23

### Changed
- Docs: the README now recommends keeping `AGENT_PRIVATE_KEY` in a dedicated
  `BVCC_ENV_FILE` instead of inlining it in the MCP host config, and the connect
  examples use `npx -y @bvcc/agent-mcp`. No code/behavior change.

## [0.1.0] — 2026-06-23

First public release.

### Added
- MCP server exposing a BVCC Agent Wallet to MCP runtimes (Claude Code, Cursor,
  the Claude app, LM Studio). Tools are generated from the `@bvcc/agent-sdk`
  capability catalog — no per-tool code here.
- Tool classes annotated by `kind`: 🟢 read / 🟡 simulate / 🔴 write
  (`destructiveHint`), so clients can gate or confirm.
- `BVCC_MCP_READONLY=true` — expose only read/simulate tools (no fund-moving writes).
- **Multi-network**: every tool takes an optional `network` (chain id or name), so
  one server operates the agent on any supported chain; defaults to `CHAIN_ID`.
- **RPC failover**: `RPC_URL` / `RPC_URL_<chainId>` accept several comma-separated
  URLs wired into a viem `fallback` transport; the chain's public default is
  appended last. The 4 mainnets ship with a backup RPC out of the box.
- **`BVCC_ENV_FILE`**: load config from a dedicated env file so the agent key stays
  out of the host config. Variables already set by the host win over the file.
- `QUICKSTART.md` (end-to-end setup) and `GUIDE.md` (operating workflow).

### Security
- Adds no powers: every limit is enforced on-chain by the Agent Wallet contract.
- The agent key is read from the environment, used locally to sign, never
  transmitted. Published tarball ships no sourcemaps.

[0.1.1]: https://github.com/blockventurechaincapital-crypto/bvcc-agent-mcp/releases/tag/v0.1.1
[0.1.0]: https://github.com/blockventurechaincapital-crypto/bvcc-agent-mcp/releases/tag/v0.1.0
