/**
 * Recursively convert a value into something JSON-serializable: bigints become
 * decimal strings (the SDK returns wei/raw amounts as bigint). Used for both the
 * human-readable text payload and the structured payload returned to MCP clients.
 */
export function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toJsonSafe(v);
    return out;
  }
  return value;
}

/** Pretty JSON with bigint support. */
export function stringify(value: unknown): string {
  return JSON.stringify(toJsonSafe(value), null, 2);
}
