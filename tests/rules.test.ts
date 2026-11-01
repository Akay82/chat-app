import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  updateDoc,
  serverTimestamp,
  Timestamp,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
let env: RulesTestEnvironment;
const user = (uid: string) => env.authenticatedContext(uid).firestore();
const baseChat = {
  kind: "direct",
  members: ["alice", "bob"],
  admin: "alice",
  name: "",
  description: "",
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
  lastText: "",
  lastSender: "",
};
const profile = (uid: string) => ({
  uid,
  username: uid,
  displayName: uid,
  bio: "",
  avatar: "sage",
  discoverable: true,
  showPresence: true,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});
const message = (sender = "alice") => ({
  sender,
  text: "hello",
  createdAt: serverTimestamp(),
  editedAt: null,
  deleted: false,
  reply: null,
});
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-gather",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8188,
    },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const uid of ["alice", "bob", "mallory"]) {
      await setDoc(doc(db, "users", uid), profile(uid));
      await setDoc(doc(db, "usernames", uid), { uid });
    }
    await setDoc(doc(db, "chats", "alice_bob"), baseChat);
    await setDoc(doc(db, "chats", "group"), {
      ...baseChat,
      kind: "group",
      name: "Friends",
    });
    await setDoc(doc(db, "chats", "alice_bob", "messages", "hello"), {
      ...message(),
      createdAt: Timestamp.now(),
    });
  });
});
afterAll(async () => {
  await env.cleanup();
});
describe("private chat security", () => {
  it("allows only owners to add and remove bounded JPEG thumbnails", async () => {
    const photoURL = "data:image/jpeg;base64,/9j/AA==";
    await assertSucceeds(
      updateDoc(doc(user("alice"), "users", "alice"), {
        photoURL,
        updatedAt: serverTimestamp(),
      }),
    );
    expect(
      (await getDoc(doc(user("bob"), "users", "alice"))).data()?.photoURL,
    ).toBe(photoURL);
    await assertFails(
      updateDoc(doc(user("bob"), "users", "alice"), {
        photoURL: null,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      getDoc(doc(env.unauthenticatedContext().firestore(), "users", "alice")),
    );
    await assertSucceeds(
      updateDoc(doc(user("alice"), "users", "alice"), {
        photoURL: null,
        updatedAt: serverTimestamp(),
      }),
    );
  });
  it("rejects oversized photos, external image URLs and non-JPEG data", async () => {
    for (const photoURL of [
      "data:image/jpeg;base64,/9j/" + "A".repeat(32768),
      "https://example.com/photo.jpg",
      "data:image/svg+xml;base64,AAAA",
      123,
    ]) {
      await assertFails(
        updateDoc(doc(user("alice"), "users", "alice"), {
          photoURL,
          updatedAt: serverTimestamp(),
        }),
      );
    }
  });
  it("rejects reversed duplicate direct conversation IDs", async () => {
    await assertFails(
      setDoc(doc(user("alice"), "chats", "bob_alice"), {
        ...baseChat,
        members: ["bob", "alice"],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });
  it("denies strangers and anonymous users", async () => {
    await assertFails(getDoc(doc(user("mallory"), "chats", "alice_bob")));
    await assertFails(
      getDoc(
        doc(
          env.unauthenticatedContext().firestore(),
          "chats",
          "alice_bob",
          "messages",
          "hello",
        ),
      ),
    );
    await assertFails(
      getDoc(doc(user("mallory"), "chats", "alice_bob", "messages", "hello")),
    );
  });
  it("supports a real message send, read, edit and tombstone flow", async () => {
    const db = user("alice"),
      target = doc(db, "chats", "alice_bob", "messages", "new");
    const batch = writeBatch(db);
    batch.set(target, message());
    batch.update(doc(db, "chats", "alice_bob"), {
      lastText: "hello",
      lastSender: "alice",
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
    expect(
      (
        await assertSucceeds(
          getDoc(doc(user("bob"), "chats", "alice_bob", "messages", "new")),
        )
      ).data()?.text,
    ).toBe("hello");
    await assertSucceeds(
      updateDoc(target, { text: "edited", editedAt: serverTimestamp() }),
    );
    await assertSucceeds(
      updateDoc(target, {
        text: "",
        deleted: true,
        reply: null,
        editedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(target, {
        text: "resurrect",
        deleted: false,
        editedAt: serverTimestamp(),
      }),
    );
  });
  it("rejects spoofing and editing someone else’s message", async () => {
    await assertFails(
      setDoc(
        doc(user("bob"), "chats", "alice_bob", "messages", "fake"),
        message("alice"),
      ),
    );
    await assertFails(
      updateDoc(doc(user("bob"), "chats", "alice_bob", "messages", "hello"), {
        text: "hacked",
        editedAt: serverTimestamp(),
      }),
    );
  });
  it("rejects changing protected message metadata", async () => {
    await assertFails(
      updateDoc(doc(user("alice"), "chats", "alice_bob", "messages", "hello"), {
        sender: "bob",
        editedAt: serverTimestamp(),
      }),
    );
  });
  it("supports indexed membership queries", async () => {
    const snap = await assertSucceeds(
      getDocs(
        query(
          collection(user("alice"), "chats"),
          where("members", "array-contains", "alice"),
          orderBy("updatedAt", "desc"),
          limit(50),
        ),
      ),
    );
    expect(snap.size).toBe(2);
  });
  it("enforces blocks on sending and creation", async () => {
    await assertSucceeds(
      setDoc(doc(user("bob"), "users", "bob", "blocks", "alice"), {
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(
        doc(user("alice"), "chats", "alice_bob", "messages", "blocked"),
        message(),
      ),
    );
  });
  it("permits own receipt and forbids another user’s", async () => {
    await assertSucceeds(
      setDoc(doc(user("alice"), "chats", "alice_bob", "receipts", "alice"), {
        readAt: serverTimestamp(),
        deliveredAt: serverTimestamp(),
        typingUntil: Date.now() + 5000,
      }),
    );
    await assertFails(
      setDoc(doc(user("bob"), "chats", "alice_bob", "receipts", "alice"), {
        readAt: serverTimestamp(),
      }),
    );
  });
  it("scopes reactions to the authenticated member", async () => {
    await assertSucceeds(
      setDoc(
        doc(
          user("alice"),
          "chats",
          "alice_bob",
          "messages",
          "hello",
          "reactions",
          "alice",
        ),
        { emoji: "❤️" },
      ),
    );
    await assertFails(
      setDoc(
        doc(
          user("bob"),
          "chats",
          "alice_bob",
          "messages",
          "hello",
          "reactions",
          "alice",
        ),
        { emoji: "👍" },
      ),
    );
  });
});
describe("profiles and usernames", () => {
  it("allows atomic profile and username creation", async () => {
    const db = user("charlie"),
      batch = writeBatch(db);
    await assertSucceeds(getDoc(doc(db, "usernames", "charlie")));
    batch.set(doc(db, "users", "charlie"), profile("charlie"));
    batch.set(doc(db, "usernames", "charlie"), { uid: "charlie" });
    await assertSucceeds(batch.commit());
  });
  it("denies profile impersonation and email disclosure fields", async () => {
    await assertFails(
      updateDoc(doc(user("bob"), "users", "alice"), {
        displayName: "Hacked",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(user("alice"), "users", "alice"), {
        email: "private@example.com",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(getDocs(collection(user("alice"), "users")));
  });
  it("prevents stealing a username", async () => {
    await assertFails(
      setDoc(doc(user("mallory"), "usernames", "alice"), { uid: "mallory" }),
    );
  });
  it("requires old username release and reserves the new username atomically", async () => {
    const db = user("alice");
    const batch = writeBatch(db);
    batch.set(doc(db, "usernames", "alice_new"), { uid: "alice" });
    batch.update(doc(db, "users", "alice"), {
      username: "alice_new",
      updatedAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });
  it("supports an atomic rename", async () => {
    const db = user("alice"),
      batch = writeBatch(db);
    batch.delete(doc(db, "usernames", "alice"));
    batch.set(doc(db, "usernames", "alice_new"), { uid: "alice" });
    batch.update(doc(db, "users", "alice"), {
      username: "alice_new",
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
  });
});
describe("group management", () => {
  it("restricts group avatar changes to admins", async () => {
    await assertSucceeds(
      updateDoc(doc(user("alice"), "chats", "group"), {
        avatar: "peach",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(user("bob"), "chats", "group"), {
        avatar: "sky",
        updatedAt: serverTimestamp(),
      }),
    );
  });
  it("prevents self-promotion and member additions by non-admins", async () => {
    await assertFails(
      updateDoc(doc(user("bob"), "chats", "group"), {
        admin: "bob",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(user("bob"), "chats", "group"), {
        members: ["alice", "bob", "mallory"],
        updatedAt: serverTimestamp(),
      }),
    );
  });
  it("allows admin add and remove and allows members to leave", async () => {
    await assertSucceeds(
      updateDoc(doc(user("alice"), "chats", "group"), {
        members: ["alice", "bob", "mallory"],
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(user("alice"), "chats", "group"), {
        members: ["alice", "bob"],
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(user("bob"), "chats", "group"), {
        members: ["alice"],
        updatedAt: serverTimestamp(),
      }),
    );
  });
  it("does not allow rename while leaving", async () => {
    await assertFails(
      updateDoc(doc(user("bob"), "chats", "group"), {
        members: ["alice"],
        name: "Hacked",
        updatedAt: serverTimestamp(),
      }),
    );
  });
});
describe("WebRTC signaling", () => {
  const data = () => ({
    chatId: "alice_bob",
    caller: "alice",
    callee: "bob",
    participants: ["alice", "bob"],
    kind: "voice",
    state: "ringing",
    offer: { type: "offer", sdp: "test-sdp" },
    answer: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 60000),
  });
  it("protects offers and participant identity", async () => {
    await assertSucceeds(setDoc(doc(user("alice"), "calls", "call"), data()));
    await assertFails(getDoc(doc(user("mallory"), "calls", "call")));
    await assertFails(setDoc(doc(user("mallory"), "calls", "spoof"), data()));
    await assertFails(
      updateDoc(doc(user("bob"), "calls", "call"), {
        caller: "bob",
        updatedAt: serverTimestamp(),
      }),
    );
  });
  it("supports answer/connect/end and rejects terminal resurrection", async () => {
    await setDoc(doc(user("alice"), "calls", "call"), data());
    await assertFails(
      updateDoc(doc(user("alice"), "calls", "call"), {
        state: "connecting",
        answer: { type: "answer", sdp: "sdp" },
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(user("bob"), "calls", "call"), {
        state: "connecting",
        answer: { type: "answer", sdp: "sdp" },
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(user("alice"), "calls", "call"), {
        state: "connected",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(user("bob"), "calls", "call"), {
        state: "ended",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(user("alice"), "calls", "call"), {
        state: "connected",
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(user("alice"), "calls", "call"), {
        offer: { type: "offer", sdp: "" },
        answer: null,
        updatedAt: serverTimestamp(),
      }),
    );
    expect(
      (await getDoc(doc(user("bob"), "calls", "call"))).data()?.offer.sdp,
    ).toBe("");
  });
  it("only participants may write their own ICE candidates", async () => {
    await setDoc(doc(user("alice"), "calls", "call"), data());
    await assertSucceeds(
      setDoc(doc(user("alice"), "calls", "call", "candidates", "one"), {
        owner: "alice",
        candidate: { candidate: "test" },
      }),
    );
    await assertFails(
      setDoc(doc(user("bob"), "calls", "call", "candidates", "two"), {
        owner: "alice",
        candidate: { candidate: "test" },
      }),
    );
    await assertFails(
      getDoc(doc(user("mallory"), "calls", "call", "candidates", "one")),
    );
  });
});
