import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Fleet data-layer golden paths against a Firestore emulator. Each spec must refuse to run
// unless FIRESTORE_EMULATOR_HOST is set, so it can never touch production data:
// pnpm exec firebase emulators:exec --only firestore "pnpm exec vitest run --config vitest.emulator.config.mjs"
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
      { find: /^server-only$/, replacement: fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)) },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/*.emulator.spec.ts"],
    exclude: ["tests/lattice-program.emulator.spec.ts"],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
