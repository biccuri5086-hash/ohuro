import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,mjs}", "src/**/*.test.{ts,tsx}"],
    environment: "node",
    testTimeout: 10_000,
  },
});
