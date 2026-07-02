import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Iteration 1 tests are pure logic (momentum, roster) and need no DOM.
    // Component tests in iteration 2 can opt into jsdom per-file with a
    // `// @vitest-environment jsdom` pragma.
    environment: "node",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
