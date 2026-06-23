// LIVE read-only check: drives the MCP server end-to-end against the real agent
// on-chain. Calls ONLY read tools (getCapabilities, getNativeBalance) — moves no
// funds. Loads credentials from ../bvcc-agent-sdk/.env. Forces read-only mode so
// no write tool can even be invoked.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "../dist/server.js");
const envPath = resolve(__dirname, "../../bvcc-agent-sdk/.env");

const dotenv = {};
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
  if (m) dotenv[m[1]] = m[2].replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "").trim();
}

const env = {
  ...process.env,
  AGENT_PRIVATE_KEY: dotenv.AGENT_PRIVATE_KEY,
  WALLET_ADDRESS: dotenv.WALLET_ADDRESS,
  CHAIN_ID: dotenv.CHAIN_ID,
  BVCC_MCP_READONLY: "true", // hard guarantee: no write tools exposed
};

const child = spawn("node", [serverPath], { env });
let buf = "";
const responses = new Map();
const stderr = [];
child.stderr.on("data", (d) => stderr.push(d.toString()));

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
    if (responses.has(3) && responses.has(10)) finish();
  }
});

function textOf(id) {
  const r = responses.get(id);
  return r?.result?.content?.[0]?.text ?? JSON.stringify(r);
}

function finish() {
  console.error(stderr.join("").trim());
  console.log("\n=== getCapabilities ===");
  console.log(textOf(3));
  console.log("\n=== getNativeBalance ===");
  console.log(textOf(10));
  child.kill();
  process.exit(0);
}

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "live", version: "0" } } });
send({ jsonrpc: "2.0", method: "notifications/initialized" });
send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "getCapabilities", arguments: {} } });
send({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "getNativeBalance", arguments: {} } });

setTimeout(() => { console.error("TIMEOUT\n" + stderr.join("")); child.kill(); process.exit(1); }, 30000);
