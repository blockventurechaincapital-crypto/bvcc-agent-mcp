# Changelog

All notable changes to `@bvcc/agent-mcp` are documented here. This project follows
[Semantic Versioning](https://semver.org/). While on `0.x`, behavior may change
between minor versions.

The SDK is bundled into this package, so updating the MCP is all a tool user needs
to get new capabilities (e.g. a future Aave release) — see **Upgrading** in the
README.

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
