import { defineConfig } from "tsup";
import { builtinModules } from "node:module";

const bundleAll = !!process.env.BUNDLE_ALL;

// Standalone bundles include dependencies which still use CommonJS globals, including
// the Feishu SDK's version lookup. No surrounding package.json/node_modules is available.
const requireShim = bundleAll
  ? 'import { createRequire as __cr } from "node:module"; import { fileURLToPath as __filePath } from "node:url"; import { dirname as __dirPath } from "node:path"; const require = __cr(import.meta.url); const __filename = __filePath(import.meta.url); const __dirname = __dirPath(__filename);'
  : "";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: true,
  noExternal: bundleAll ? [/(.*)/] : ["@piko/shared"],
  external: bundleAll ? builtinModules.flatMap((m) => [m, `node:${m}`]) : [],
  banner: {
    js: `#!/usr/bin/env node\n${requireShim}`,
  },
});
