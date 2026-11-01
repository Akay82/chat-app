import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { User } from "firebase/auth";
const mock = vi.hoisted(() => ({
  authCallback: null as null | ((user: User | null) => void),
  profileCallback: null as
    null | ((snapshot: { exists: () => boolean; data: () => unknown }) => void),
  profileError: null as null | ((error: unknown) => void),
}));
vi.mock("../src/firebase", () => ({
  configured: true,
  auth: {},
  db: {},
  rtdb: {},
}));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, callback) => {
    mock.authCallback = callback;
    return () => {};
  }),
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn((_ref, callback, error) => {
    mock.profileCallback = callback;
    mock.profileError = error;
    return () => {};
  }),
}));
import { SessionProvider, useSession } from "../src/session";
afterEach(cleanup);
describe("authentication state", () => {
  it("waits for the signed-in profile and clears private state on logout", () => {
    const { result } = renderHook(() => useSession(), {
      wrapper: ({ children }) => <SessionProvider>{children}</SessionProvider>,
    });
    expect(result.current.loading).toBe(true);
    act(() => mock.authCallback?.({ uid: "alice" } as User));
    expect(result.current.loading).toBe(true);
    act(() =>
      mock.profileCallback?.({
        exists: () => true,
        data: () => ({ uid: "alice", displayName: "Alice" }),
      }),
    );
    expect(result.current.profile?.uid).toBe("alice");
    expect(result.current.loading).toBe(false);
    act(() => mock.authCallback?.(null));
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
  });
  it("finishes loading when no account is signed in", () => {
    const { result } = renderHook(() => useSession(), {
      wrapper: ({ children }) => <SessionProvider>{children}</SessionProvider>,
    });
    act(() => mock.authCallback?.(null));
    expect(result.current.loading).toBe(false);
  });
  it("distinguishes denied profile access from missing onboarding and supports retry", () => {
    const { result } = renderHook(() => useSession(), {
      wrapper: ({ children }) => <SessionProvider>{children}</SessionProvider>,
    });
    act(() => mock.authCallback?.({ uid: "alice" } as User));
    act(() => mock.profileError?.({ code: "permission-denied" }));
    expect(result.current.loading).toBe(false);
    expect(result.current.profileError).toContain("Firestore rules");
    expect(result.current.profileError).not.toContain("blocked");
    act(() => result.current.retryProfile());
    expect(result.current.loading).toBe(true);
    act(() =>
      mock.profileCallback?.({ exists: () => false, data: () => undefined }),
    );
    expect(result.current.profileError).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(false);
  });
  it("ignores late profile callbacks after logout", () => {
    const { result } = renderHook(() => useSession(), {
      wrapper: ({ children }) => <SessionProvider>{children}</SessionProvider>,
    });
    act(() => mock.authCallback?.({ uid: "alice" } as User));
    const oldCallback = mock.profileCallback;
    act(() => mock.authCallback?.(null));
    act(() =>
      oldCallback?.({ exists: () => true, data: () => ({ uid: "alice" }) }),
    );
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
  });
});
