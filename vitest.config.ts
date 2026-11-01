import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "virtual:pwa-register/react": fileURLToPath(
        new URL("./tests/pwa-register.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: [
      "tests/unit.test.ts",
      "tests/ui.test.tsx",
      "tests/calling.test.tsx",
      "tests/session.test.tsx",
      "tests/auth.test.tsx",
      "tests/logout.test.ts",
      "tests/pwa.test.tsx",
      "tests/avatar.test.tsx",
      "tests/profile-photo.test.tsx",
      "tests/chat-behavior.test.ts",
      "tests/chat-features.test.tsx",
      "tests/notifications.test.ts",
      "tests/connectivity.test.tsx",
    ],
  },
});
