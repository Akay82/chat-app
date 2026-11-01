import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { ref, set, get } from "firebase/database";
import { beforeAll, afterAll, describe, it } from "vitest";
let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-gather",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("database.rules.json", "utf8"),
    },
  });
});
afterAll(async () => {
  await env.cleanup();
});
describe("presence privacy", () => {
  it("permits only the owner to write valid presence", async () => {
    const db = env.authenticatedContext("alice").database();
    await assertSucceeds(
      set(ref(db, "presence/alice"), {
        online: true,
        visible: true,
        lastSeen: Date.now(),
      }),
    );
    await assertFails(
      set(ref(db, "presence/bob"), {
        online: true,
        visible: true,
        lastSeen: Date.now(),
      }),
    );
    await assertFails(
      set(ref(db, "presence/alice"), {
        online: true,
        visible: true,
        lastSeen: Date.now(),
        extra: "not allowed",
      }),
    );
  });
  it("honors private visibility and rejects anonymous reads", async () => {
    const alice = env.authenticatedContext("alice").database(),
      bob = env.authenticatedContext("bob").database();
    await set(ref(alice, "presence/alice"), {
      online: false,
      visible: false,
      lastSeen: Date.now(),
    });
    await assertFails(get(ref(bob, "presence/alice")));
    await assertSucceeds(get(ref(alice, "presence/alice")));
    await assertFails(
      get(ref(env.unauthenticatedContext().database(), "presence/alice")),
    );
  });
});
