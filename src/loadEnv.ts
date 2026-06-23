import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Optional .env loading — so the agent key can live in a dedicated, gitignored,
 * chmod-600 file instead of inline in the MCP host's config (which gets shared,
 * synced and screenshotted). This is NOT encryption: the file is still plaintext
 * on disk. Its value is keeping the secret out of the host config and out of any
 * sync/backup that picks up that config. Pair it with `chmod 600` and a path
 * outside any cloud-synced folder.
 *
 * Precedence: variables already present in the process environment WIN. An env
 * file only fills what the host did not set — so an explicit `env` block in the
 * MCP config still overrides the file, never the other way around.
 *
 * Source resolution:
 *   - BVCC_ENV_FILE=/abs/path/.env  → load that exact file; a missing file is a
 *     hard error (you asked for it explicitly).
 *   - otherwise                     → best-effort `.env` in the process cwd;
 *     silently ignored if absent.
 */
export function loadEnvFile(env: NodeJS.ProcessEnv = process.env): void {
  const explicit = env.BVCC_ENV_FILE?.trim();
  const path = explicit ? resolve(explicit) : resolve(process.cwd(), ".env");

  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    if (explicit) {
      throw new Error(
        `BVCC_ENV_FILE points to "${path}" but it could not be read. ` +
          `Check the path and file permissions.`,
      );
    }
    return; // no implicit .env — that's fine
  }

  for (const [key, value] of parseEnv(content)) {
    if (env[key] === undefined) env[key] = value;
  }
}

/** Minimal, dependency-free .env parser. Handles `KEY=value`, quotes, `export`,
 * inline `# comments` on unquoted values, and blank/comment lines. */
function parseEnv(content: string): [string, string][] {
  const out: [string, string][] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ") ? line.slice(7).trimStart() : line;
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(eq + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1); // quoted: keep as-is, no comment stripping
    } else {
      const hash = value.indexOf(" #"); // strip inline comment on unquoted values
      if (hash !== -1) value = value.slice(0, hash).trimEnd();
    }
    out.push([key, value]);
  }
  return out;
}
