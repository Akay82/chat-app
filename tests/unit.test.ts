import { describe, it, expect } from "vitest";
import {
  authSchema,
  usernameSchema,
  messageSchema,
  directId,
  canTransition,
  safeUrl,
  friendly,
} from "../src/lib";
describe("input validation", () => {
  it("normalizes usernames and rejects invalid names", () => {
    expect(usernameSchema.parse(" Alice_01 ")).toBe("alice_01");
    for (const s of ["ab", "1alice", "a/b", "a".repeat(25)])
      expect(usernameSchema.safeParse(s).success).toBe(false);
  });
  it("validates authentication", () => {
    expect(
      authSchema.safeParse({ email: "bad", password: "123" }).success,
    ).toBe(false);
    expect(
      authSchema.safeParse({ email: "a@b.com", password: "long-password" })
        .success,
    ).toBe(true);
  });
  it("bounds and trims messages", () => {
    expect(messageSchema.parse(" hi ")).toBe("hi");
    expect(messageSchema.safeParse(" ").success).toBe(false);
    expect(messageSchema.safeParse("x".repeat(4001)).success).toBe(false);
  });
  it("creates a symmetric private chat key", () =>
    expect(directId("b", "a")).toBe(directId("a", "b")));
  it("only links safe protocols", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("https://example.org")).toBe("https://example.org/");
  });
  it("explains credential and network errors", () => {
    expect(friendly({ code: "auth/invalid-credential" })).toContain(
      "incorrect",
    );
    expect(friendly({ code: "unavailable" })).toContain("reconnect");
  });
});
describe("call lifecycle", () => {
  it("allows only the callee to accept/reject", () => {
    expect(canTransition("ringing", "connecting", "callee")).toBe(true);
    expect(canTransition("ringing", "connecting", "caller")).toBe(false);
    expect(canTransition("ringing", "rejected", "caller")).toBe(false);
  });
  it("prevents resurrecting terminal calls", () => {
    for (const state of ["ended", "failed", "missed", "rejected"])
      expect(canTransition(state, "connected", "caller")).toBe(false);
  });
  it("permits connection and hangup", () => {
    expect(canTransition("connecting", "connected", "caller")).toBe(true);
    expect(canTransition("connected", "ended", "callee")).toBe(true);
  });
});
