import { afterEach, describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  messageOrder,
  messageMatches,
  messageStatus,
  isReplySwipe,
  notificationPath,
} from "../src/chat-behavior";
import {
  saveRecovery,
  readDraft,
  readOutbox,
  clearAccountRecovery,
} from "../src/recovery";
import type { Message } from "../src/types";
const message = (id: string, text: string, deleted = false): Message => ({
  id,
  text,
  deleted,
  sender: "alice",
  createdAt: Timestamp.fromMillis(100),
  editedAt: null,
  reply: null,
});
afterEach(() => sessionStorage.clear());
describe("chat behavior", () => {
  it("keeps equal-timestamp history in the same order across pages", () => {
    expect(
      [message("b", "second"), message("a", "first")]
        .sort(messageOrder)
        .map((m) => m.id),
    ).toEqual(["a", "b"]);
  });
  it("searches literal keywords without returning deleted text", () => {
    expect(
      messageMatches(
        [message("1", "Hello [World]"), message("2", "hello [world]", true)],
        " [world] ",
      ).map((m) => m.id),
    ).toEqual(["1"]);
    expect(messageMatches([message("1", "hi")], "  ")).toEqual([]);
  });
  it("requires every other group member for delivered/read status", () => {
    const m = message("1", "hello"),
      members = ["alice", "bob", "carol"];
    expect(messageStatus({ ...m, pending: true }, members, "alice", {})).toBe(
      "Sending",
    );
    expect(messageStatus(m, members, "alice", {})).toBe("Sent");
    expect(
      messageStatus(m, members, "alice", {
        bob: { readAt: Timestamp.fromMillis(200) },
      }),
    ).toBe("Sent");
    expect(
      messageStatus(m, members, "alice", {
        bob: { deliveredAt: Timestamp.fromMillis(200) },
        carol: { deliveredAt: Timestamp.fromMillis(200) },
      }),
    ).toBe("Delivered");
    expect(
      messageStatus(m, members, "alice", {
        bob: { readAt: Timestamp.fromMillis(200) },
        carol: { readAt: Timestamp.fromMillis(200) },
      }),
    ).toBe("Read");
  });
  it("recognizes deliberate right swipes while preserving scrolling and long presses", () => {
    expect(isReplySwipe(80, 10, 300)).toBe(true);
    for (const [x, y, time] of [
      [10, 0, 100],
      [80, 40, 300],
      [-90, 0, 300],
      [90, 0, 1200],
    ])
      expect(isReplySwipe(x, y, time)).toBe(false);
  });
  it("limits notification navigation to local chat routes", () => {
    expect(notificationPath("/chat/alice_bob")).toBe("/chat/alice_bob");
    for (const path of [
      "https://evil.example",
      "//evil.example",
      "/chat/../admin",
      "javascript:alert(1)",
      null,
    ])
      expect(notificationPath(path)).toBe("/");
  });
});
describe("tab-scoped recovery", () => {
  it("restores drafts and replies separately per account and chat", () => {
    const draft = {
      text: "Do not lose this",
      reply: { id: "m1", text: "Original" },
    };
    saveRecovery("alice", "chat", "draft", draft);
    expect(readDraft("alice", "chat")).toEqual(draft);
    expect(readDraft("bob", "chat").text).toBe("");
    expect(readDraft("alice", "other").text).toBe("");
  });
  it("restores unsent messages as unconfirmed with their original retry IDs", () => {
    saveRecovery("alice", "chat", "outbox", {
      "stable-id": { text: "Hello", reply: null },
    });
    expect(readOutbox("alice", "chat")["stable-id"]).toEqual({
      text: "Hello",
      reply: null,
      error: expect.stringContaining("Not confirmed"),
      unconfirmed: true,
    });
  });
  it("clears only the signed-out account and removes empty drafts", () => {
    saveRecovery("alice", "chat", "draft", { text: "a", reply: null });
    saveRecovery("bob", "chat", "draft", { text: "b", reply: null });
    clearAccountRecovery("alice");
    expect(readDraft("alice", "chat").text).toBe("");
    expect(readDraft("bob", "chat").text).toBe("b");
    saveRecovery("bob", "chat", "draft", { text: "", reply: null });
    expect(sessionStorage.length).toBe(0);
  });
  it("ignores corrupt, oversized and unsupported stored records", () => {
    sessionStorage.setItem("gather:recovery:alice:chat:draft", "{bad");
    expect(readDraft("alice", "chat").text).toBe("");
    sessionStorage.setItem(
      "gather:recovery:alice:chat:outbox",
      JSON.stringify({
        bad: { text: "x".repeat(4001), reply: null },
        valid: { text: "okay", reply: null },
        unsafe: { text: "bad", reply: { id: 1, text: "bad" } },
      }),
    );
    expect(Object.keys(readOutbox("alice", "chat"))).toEqual(["valid"]);
  });
});
