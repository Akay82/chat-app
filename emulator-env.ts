import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Vite normally lets .env.local override .env.emulator. Explicit defines keep
// developer production credentials out of emulator sessions and integration tests.
export function emulatorDefines() {
  const values = parseEnv(
    readFileSync(new URL("./.env.emulator", import.meta.url), "utf8"),
  );
  if (
    values.VITE_USE_EMULATORS !== "true" ||
    values.VITE_FIREBASE_PROJECT_ID !== "demo-gather"
  )
    throw Error("Emulator configuration must use demo-gather.");
  return Object.fromEntries(
    Object.entries(values)
      .filter(([key]) => key.startsWith("VITE_"))
      .map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );
}
