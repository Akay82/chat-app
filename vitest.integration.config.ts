import { defineConfig } from "vitest/config";
import { emulatorDefines } from "./emulator-env.ts";
export default defineConfig({
  define: emulatorDefines(),
  test: {
    environment: "jsdom",
    include: ["tests/integration.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
