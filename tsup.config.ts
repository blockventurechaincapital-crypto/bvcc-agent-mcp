import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

// Single source of truth for the version the server reports over MCP. It used to be
// a literal in server.ts and drifted two releases behind package.json before anyone
// noticed — the handshake announced 0.1.6 while npm served 0.2.1.
const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

export default defineConfig({
  entry: ["src/server.ts"],
  define: { __PKG_VERSION__: JSON.stringify(version) },
  format: ["esm"],
  target: "es2022",
  clean: true,
  // No sourcemaps in the published tarball — the bundle inlines the whole SDK, so
  // a map would ship all source and bloat the package. Build with `tsup --sourcemap`
  // locally if you need to debug.
  sourcemap: false,
  // Bundle ALL dependencies (incl. the file:-linked @bvcc/agent-sdk) into a
  // single self-contained server.js. This makes the binary portable: it runs
  // without node_modules and across platforms (built on WSL, run on Windows).
  noExternal: [/.*/],
  banner: { js: "#!/usr/bin/env node" },
});
