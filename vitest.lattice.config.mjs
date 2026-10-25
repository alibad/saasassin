import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Performance data-layer golden path against the Firestore emulator:
// pnpm exec firebase emulators:exec --only firestore "pnpm exec vitest run --config vitest.lattice.config.mjs"
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
      { find: /^server-only$/, replacement: fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)) },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/lattice-program.emulator.spec.ts"],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
