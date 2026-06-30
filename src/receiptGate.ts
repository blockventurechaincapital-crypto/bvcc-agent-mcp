/**
 * Opt-in "Receipt Required" gate for on-chain write capabilities.
 *
 * OFF BY DEFAULT. When BVCC_MCP_RECEIPTS is not enabled, none of this loads and
 * the server behaves byte-identically to before. When enabled, every `write`
 * capability (sendNative / sendToken / approve / swapV3 / swapV4) must arrive
 * with a verifiable authorization receipt — proof a named human approved THIS
 * exact transfer — or it refuses to broadcast:
 *
 *   missing receipt   -> refused (RECEIPT_REQUIRED_STATUS)
 *   valid receipt     -> the tx is signed + broadcast (receipt consumed once)
 *   replayed receipt  -> refused (one-time consumption)
 *   forged receipt    -> refused (signature / action-binding fails)
 *
 * This is portable accountability evidence the operator keeps for their own
 * liability — NOT auth and NOT permissions (the contract still enforces every
 * on-chain limit). It is fully offline: the verifier lives in
 * @emilia-protocol/require-receipt (Apache-2.0); no API key, no account, no
 * EMILIA server is trusted. Spec: IETF I-D draft-schrock-ep-authorization-receipts.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  makeReceiptGate,
  findActionRequirement,
  RECEIPT_REQUIRED_STATUS,
  type ReceiptGate,
  type ActionRequirement,
} from "@emilia-protocol/require-receipt";
import type { Capability } from "@bvcc/agent-sdk/catalog";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Key args, per write capability, that a receipt is bound to. A receipt
 *  approving "send 1 ETH to 0xA" therefore can't authorize "send 1 ETH to 0xB"
 *  or a swap — the bound action differs, so verification fails. */
const BINDING_KEYS: Record<string, readonly string[]> = {
  sendNative: ["to", "amount"],
  sendToken: ["token", "to", "amount"],
  approve: ["token", "spender", "amount"],
  swapV3: ["tokenIn", "tokenOut", "amountIn"],
  swapV4: ["tokenIn", "tokenOut", "amountIn"],
};

/** Build a stable, order-independent target string from the call's key args. */
function bindingTarget(tool: string, args: Record<string, unknown>): string {
  const keys = BINDING_KEYS[tool] ?? Object.keys(args).sort();
  return keys.map((k) => `${k}=${String(args[k] ?? "")}`).join("|");
}

/** Result the dispatch closure acts on: run the action, or refuse it. */
export type GuardOutcome =
  | { kind: "allow" }
  | { kind: "refuse"; status: number; body: unknown }
  | {
      kind: "ran";
      result: unknown;
      evidence: { receipt_id: string; outcome?: string; signer?: string };
    };

export interface ReceiptGating {
  /**
   * Guard one write capability call. Tools not marked receipt_required in the
   * manifest return { kind: "allow" } (caller invokes as normal). For guarded
   * tools, this RUNS the action via the gate (binding + one-time consume) and
   * returns { kind: "ran" }, or refuses with { kind: "refuse" }.
   */
  guard(
    cap: Capability<never>,
    args: Record<string, unknown>,
    receipt: unknown,
    invoke: () => Promise<unknown>,
  ): Promise<GuardOutcome>;
}

function truthy(v: string | undefined): boolean {
  return v === "1" || v?.toLowerCase() === "true" || v?.toLowerCase() === "yes";
}

/**
 * Load receipt gating if (and only if) the operator opted in via BVCC_MCP_RECEIPTS.
 * Returns null when disabled — the server then runs exactly as before.
 *
 * PRODUCTION: set BVCC_MCP_RECEIPT_KEYS to a comma-separated list of issuer SPKI
 * keys you trust. With it set, only receipts from those issuers verify. Without
 * it (demo), the gate accepts a receipt's own inline key (proves integrity, NOT
 * issuer trust) so the rail can be exercised end-to-end with zero setup.
 */
export function loadReceiptGating(env: NodeJS.ProcessEnv = process.env): ReceiptGating | null {
  if (!truthy(env.BVCC_MCP_RECEIPTS)) return null;

  const manifestPath = env.BVCC_MCP_ACTIONS_FILE?.trim() || resolve(HERE, "../agent-actions.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
  const manifestUrl =
    (manifest as { service?: { manifest_url?: string } }).service?.manifest_url ||
    "/.well-known/agent-actions.json";

  const trustedKeys = (env.BVCC_MCP_RECEIPT_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const allowInlineKey = trustedKeys.length === 0; // demo fallback; off once keys are pinned.

  // One gate per action type (each keeps its own one-time-consumption store).
  const gates = new Map<string, ReceiptGate>();
  const gateFor = (req: ActionRequirement): ReceiptGate => {
    let gate = gates.get(req.action_type);
    if (!gate) {
      gate = makeReceiptGate({
        action: req.action_type,
        trustedKeys,
        allowInlineKey,
        maxAgeSec: req.max_age_sec,
        statusCode: RECEIPT_REQUIRED_STATUS,
        manifestUrl,
        assuranceClass: req.assurance_class,
        // store: pass a durable {has,add} for restart/multi-instance one-time use.
      });
      gates.set(req.action_type, gate);
    }
    return gate;
  };

  return {
    async guard(cap, args, receipt, invoke) {
      const req = findActionRequirement(manifest, { protocol: "mcp", tool: cap.id });
      if (!req || !req.receipt_required) return { kind: "allow" };

      const r = await gateFor(req).run(
        receipt,
        { target: bindingTarget(cap.id, args) },
        // The gate consumes the receipt only if the tx broadcast SUCCEEDS; a
        // thrown error (revert/RPC failure) releases it so the approval is retryable.
        async () => invoke(),
      );

      if (r.ok) {
        return {
          kind: "ran",
          result: r.result,
          evidence: { receipt_id: r.receiptId, outcome: r.outcome, signer: r.signer },
        };
      }
      return { kind: "refuse", status: r.status, body: r.body };
    },
  };
}
