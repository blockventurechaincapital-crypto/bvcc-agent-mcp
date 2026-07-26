// Smoke test: spawn the built MCP server, speak JSON-RPC over stdio, and assert
// it initializes and lists the expected tools. No RPC/chain calls are made
// (tools/list does not touch the network). Uses a throwaway public test key.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "../dist/server.js");

// Well-known Anvil/Hardhat test key #1 — public, holds no real funds.
const env = {
  ...process.env,
  AGENT_PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  WALLET_ADDRESS: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // placeholder — smoke does tools/list only, no chain calls
  CHAIN_ID: "42161",
};

function runCase(label, extraEnv, expectWrites, opts = {}) {
  const baseEnv = opts.baseEnv ?? env;
  return new Promise((resolveCase, rejectCase) => {
    const child = spawn("node", [serverPath], { env: { ...baseEnv, ...extraEnv } });
    let buf = "";
    const responses = new Map();

    const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");

    child.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.id != null) responses.set(msg.id, msg);
        if (msg.id === 3) finish();
      }
    });

    child.on("error", rejectCase);

    const stderr = [];
    child.stderr.on("data", (d) => stderr.push(d.toString()));

    function finish() {
      const list = responses.get(2);
      const tools = list?.result?.tools ?? [];
      const ids = tools.map((t) => t.name).sort();
      const writes = tools.filter((t) => t.annotations?.destructiveHint).map((t) => t.name);
      const allHaveNetwork = tools.every((t) => t.inputSchema?.properties?.network);
      const prompts = (responses.get(3)?.result?.prompts ?? []).map((p) => p.name).sort();
      child.kill();
      resolveCase({ label, ids, writes, prompts, expectWrites, allHaveNetwork, stderr: stderr.join("") });
    }

    // Handshake
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke", version: "0" },
      },
    });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    send({ jsonrpc: "2.0", id: 3, method: "prompts/list", params: {} });

    setTimeout(() => {
      child.kill();
      rejectCase(new Error(`${label}: timed out. stderr:\n${stderr.join("")}`));
    }, 15000);
  });
}

// Help tools (module "meta") are always exposed, regardless of BVCC_MCP_MODULES,
// so every module surface below includes them.
const META = ["getGuide", "listGuides"];

// The exact "core" module surface (module: undefined → core). Pinned with
// BVCC_MCP_MODULES=core so this stays deterministic as other modules (aave, lp)
// are added — those get their own cases below.
const EXPECTED_CORE = [
  "approve", "buildSwapPlan", "dryRunSendNative", "dryRunSendToken", "dryRunSwapV3",
  "dryRunSwapV4", "getAgentStatus", "getCapabilities", "getNativeBalance",
  "getRemaining", "getTokenBalances", "needsApproval", "sendNative", "sendToken",
  "swapFromNative", "swapToNative", "swapV3", "swapV4",
  ...META,
].sort();

// The Uniswap LP module surface (v3 + v4).
const EXPECTED_LP = [
  "addLiquidityV3", "burnV3", "collectFeesV3", "dryRunAddLiquidityV3",
  "dryRunRemoveLiquidityV3", "getV3Position", "removeLiquidityV3",
  "addLiquidityV4", "burnV4", "collectFeesV4", "dryRunAddLiquidityV4",
  "dryRunRemoveLiquidityV4", "getV4Position", "removeLiquidityV4",
  ...META,
].sort();

let failed = false;
function assert(cond, msg) {
  if (!cond) { failed = true; console.error("  ✗ " + msg); }
  else console.log("  ✓ " + msg);
}

const core = await runCase("core mode", { BVCC_MCP_MODULES: "core" }, true);
console.log(`\n[${core.label}] ${core.ids.length} tools`);
assert(core.ids.length === 20, "exposes 20 tools (18 core + 2 meta guides)");
assert(JSON.stringify(core.ids) === JSON.stringify(EXPECTED_CORE), "core tool ids match catalog");
assert(core.writes.length === 7, "7 core tools flagged destructive (writes)");
assert(core.allHaveNetwork, "every tool exposes an optional `network` selector");
assert(core.stderr.includes("multi-network"), "startup banner reports multi-network");
assert(
  JSON.stringify(core.prompts) ===
    JSON.stringify(["guide-getting-started", "guide-lending", "guide-liquidity", "guide-swaps"]),
  "4 guide prompts registered (one per area), independent of module filter",
);

const ro = await runCase("read-only mode", { BVCC_MCP_READONLY: "true", BVCC_MCP_MODULES: "core" }, false);
console.log(`\n[${ro.label}] ${ro.ids.length} tools`);
assert(ro.ids.length === 13, "read-only exposes 13 tools (11 core reads + 2 meta guides, no writes)");
assert(ro.writes.length === 0, "no destructive tools in read-only mode");
assert(ro.stderr.includes("mode=read-only"), "startup banner reports read-only mode");

// LP module (Uniswap v3 + v4 liquidity) — enabled on its own to prove module isolation.
const lp = await runCase("lp module", { BVCC_MCP_MODULES: "lp" }, true);
console.log(`\n[${lp.label}] ${lp.ids.length} tools`);
assert(lp.ids.length === 16, "lp module exposes 16 tools (14 v3+v4 + 2 meta guides)");
assert(JSON.stringify(lp.ids) === JSON.stringify(EXPECTED_LP), "lp tool ids match catalog");
assert(lp.writes.length === 8, "8 lp tools flagged destructive (v3+v4 mint/remove/collect/burn)");
assert(!lp.ids.includes("sendNative"), "lp module does not leak core tools");

// --- .env file loading (BVCC_ENV_FILE) ---
// A base env WITHOUT the three secrets, so the only source is the env file.
const cleanEnv = { ...process.env };
delete cleanEnv.AGENT_PRIVATE_KEY;
delete cleanEnv.WALLET_ADDRESS;
delete cleanEnv.CHAIN_ID;

const tmp = mkdtempSync(resolve(tmpdir(), "bvcc-mcp-smoke-"));
try {
  // Case: server reads ALL required config from the env file (host sets nothing).
  const envFile = resolve(tmp, "agent.env");
  writeFileSync(
    envFile,
    [
      "# bvcc agent env",
      `AGENT_PRIVATE_KEY=${env.AGENT_PRIVATE_KEY}  # inline comment, throwaway key`,
      `WALLET_ADDRESS="${env.WALLET_ADDRESS}"`,
      "CHAIN_ID=56",
      "BVCC_MCP_MODULES=core",
      "",
    ].join("\n"),
  );

  const fromFile = await runCase("env-file", { BVCC_ENV_FILE: envFile }, true, { baseEnv: cleanEnv });
  console.log(`\n[${fromFile.label}] ${fromFile.ids.length} tools`);
  assert(fromFile.ids.length === 20, "starts with config read entirely from BVCC_ENV_FILE");
  assert(fromFile.stderr.includes("chain=56"), "env-file value applied (chain=56 from file)");

  // Case: host env WINS over the env file (precedence). File says 56, host says 42161.
  const precedence = await runCase(
    "env-file precedence",
    { BVCC_ENV_FILE: envFile, CHAIN_ID: "42161" },
    true,
    { baseEnv: cleanEnv },
  );
  console.log(`\n[${precedence.label}] ${precedence.ids.length} tools`);
  assert(precedence.stderr.includes("chain=42161"), "host env overrides the env file (chain=42161)");

  // Case: multiple RPCs → fallback/failover transport on the default chain.
  const failover = await runCase(
    "rpc-failover",
    { RPC_URL: "https://arb1.arbitrum.io/rpc,https://arbitrum.llamarpc.com" },
    true,
  );
  console.log(`\n[${failover.label}] ${failover.ids.length} tools`);
  assert(failover.stderr.includes("(failover)"), "multiple RPCs enable failover transport");

  // Case: an unsupported CHAIN_ID is rejected at startup with a clear message.
  const badChain = await new Promise((res) => {
    const child = spawn("node", [serverPath], { env: { ...env, CHAIN_ID: "9999" } });
    const errOut = [];
    child.stderr.on("data", (d) => errOut.push(d.toString()));
    child.on("exit", (code) => res({ code, stderr: errOut.join("") }));
  });
  console.log(`\n[bad-chain] exit=${badChain.code}`);
  assert(badChain.code === 1, "server exits non-zero on unsupported CHAIN_ID");
  assert(
    badChain.stderr.includes("not a supported BVCC network"),
    "clear error names the unsupported CHAIN_ID",
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? "\nSMOKE FAILED" : "\nSMOKE OK");
process.exit(failed ? 1 : 0);
