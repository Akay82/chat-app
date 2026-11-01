import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  signOut: vi.fn(),
  offline: vi.fn(),
  online: vi.fn(),
}));
vi.mock("../src/firebase", () => ({
  auth: { currentUser: { uid: "alice" } },
  db: {},
  rtdb: {},
}));
vi.mock("firebase/auth", () => ({
  signOut: mock.signOut,
  deleteUser: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock("firebase/database", () => ({
  goOffline: mock.offline,
  goOnline: mock.online,
  ref: vi.fn(),
  remove: vi.fn(),
}));
import { logout } from "../src/api";
import { saveRecovery, readDraft } from "../src/recovery";
beforeEach(() => {
  vi.resetAllMocks();
  mock.signOut.mockResolvedValue(undefined);
  vi.stubEnv(
    "VITE_FIREBASE_DATABASE_URL",
    "https://demo-gather-default-rtdb.firebaseio.com",
  );
});
afterEach(() => vi.unstubAllEnvs());
describe("signout and presence", () => {
  it("clears account drafts only after successful signout", async () => {
    saveRecovery("alice", "chat", "draft", {
      text: "Keep until logout",
      reply: null,
    });
    mock.signOut.mockRejectedValueOnce(Error("Offline"));
    await expect(logout()).rejects.toThrow();
    expect(readDraft("alice", "chat").text).toBe("Keep until logout");
    await logout();
    expect(readDraft("alice", "chat").text).toBe("");
  });
  it("disconnects presence before removing authentication", async () => {
    await logout();
    expect(mock.offline).toHaveBeenCalledOnce();
    expect(mock.signOut).toHaveBeenCalledOnce();
    expect(mock.offline.mock.invocationCallOrder[0]).toBeLessThan(
      mock.signOut.mock.invocationCallOrder[0],
    );
  });
  it("restores presence when signout fails", async () => {
    mock.signOut.mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(logout()).rejects.toThrow("Storage unavailable");
    expect(mock.online).toHaveBeenCalledOnce();
  });
  it("does not touch RTDB when presence is unconfigured", async () => {
    vi.stubEnv("VITE_FIREBASE_DATABASE_URL", "");
    await logout();
    expect(mock.offline).not.toHaveBeenCalled();
    expect(mock.signOut).toHaveBeenCalledOnce();
  });
});
