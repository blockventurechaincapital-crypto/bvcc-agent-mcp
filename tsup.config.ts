import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
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
