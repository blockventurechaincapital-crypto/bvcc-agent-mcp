# Changelog

All notable changes to `@bvcc/agent-mcp` are documented here. This project follows
[Semantic Versioning](https://semver.org/). While on `0.x`, behavior may change
between minor versions.

The SDK is bundled into this package, so updating the MCP is all a tool user needs
to get new capabilities (e.g. a future Aave release) — see **Upgrading** in the
README.

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
