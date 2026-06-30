// Minimal ambient types for @emilia-protocol/require-receipt (Apache-2.0).
// The published package ships runtime ESM only (no .d.ts); this repo is strict,
// so we declare just the surface we use. See the package README for the full API.
declare module "@emilia-protocol/require-receipt" {
  /** HTTP-style status used when an action is refused for lack of a receipt (428). */
  export const RECEIPT_REQUIRED_STATUS: number;

  /** One action entry in an EP Action-Risk Manifest. */
  export interface ActionRequirement {
    action_type: string;
    receipt_required?: boolean;
    assurance_class?: string;
    max_age_sec?: number;
    [k: string]: unknown;
  }

  /** Find the requirement (if any) for a protocol+tool match in a manifest. */
  export function findActionRequirement(
    manifest: unknown,
    match: { protocol: string; tool: string },
  ): ActionRequirement | undefined;

  /** Result of a gate run: success carries evidence, refusal carries a status + body. */
  export type GateResult<T> =
    | { ok: true; receiptId: string; outcome?: string; signer?: string; result: T }
    | { ok: false; status: number; body: unknown };

  export interface ReceiptGate {
    /** Verify+reserve the receipt bound to `target`, run `fn`, then commit on
     *  success / release on failure. `fn` MUST throw on failure. */
    run<T>(
      receipt: unknown,
      ctx: { target?: unknown },
      fn: (c: { receiptId: string; outcome?: string; signer?: string }) => Promise<T>,
    ): Promise<GateResult<T>>;
  }

  export interface MakeReceiptGateOptions {
    action: string | ((target: unknown) => string);
    trustedKeys?: string[];
    allowInlineKey?: boolean;
    maxAgeSec?: number;
    allowedOutcomes?: string[];
    statusCode?: number;
    manifestUrl?: string;
    assuranceClass?: string;
    store?: { has: (id: string) => boolean; add: (id: string) => void };
  }

  /** Build a hardened, one-action Receipt-Required gate. */
  export function makeReceiptGate(opts: MakeReceiptGateOptions): ReceiptGate;
}
