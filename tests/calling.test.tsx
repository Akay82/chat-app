import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/session", () => ({
  useSession: () => ({ user: { uid: "alice" } }),
}));
vi.mock("../src/firebase", () => ({ db: {}, iceServers: () => [] }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({ id: "test-call" })),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  serverTimestamp: () => 1,
  addDoc: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [], forEach: () => {} }),
  writeBatch: () => ({
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  }),
  Timestamp: {
    now: () => ({ toMillis: () => Date.now() }),
    fromMillis: (n: number) => ({ toMillis: () => n }),
  },
}));
import { useCalls } from "../src/calling";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function media() {
  const stop = vi.fn(),
    track = { kind: "audio", stop, enabled: true };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const close = vi.fn();
  class Peer {
    addTrack = vi.fn();
    createOffer = vi.fn().mockResolvedValue({ type: "offer", sdp: "test-sdp" });
    setLocalDescription = vi.fn().mockResolvedValue(undefined);
    close = close;
  }
  vi.stubGlobal("RTCPeerConnection", Peer);
  vi.stubGlobal(
    "MediaStream",
    class {
      getTracks = () => [];
    },
  );
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    configurable: true,
  });
  return { stop, close };
}
describe("WebRTC browser lifecycle", () => {
  it("explains a missing microphone without publishing a call", async () => {
    media();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new DOMException("Requested device not found", "NotFoundError"),
    );
    const { result } = renderHook(() => useCalls());
    await act(async () => {
      await expect(
        result.current.start("alice_bob", "bob", "voice"),
      ).rejects.toThrow("available microphone");
    });
    expect(result.current.mediaIssue?.title).toBe("No call device found");
    expect(mocks.setDoc).not.toHaveBeenCalled();
    expect(result.current.active).toBeNull();
  });
  it("explains missing video hardware and suggests a voice call", async () => {
    media();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new DOMException("Not found", "NotFoundError"),
    );
    const { result } = renderHook(() => useCalls());
    await act(async () => {
      await expect(
        result.current.start("alice_bob", "bob", "video"),
      ).rejects.toThrow("microphone and camera");
    });
    expect(result.current.mediaIssue?.steps.join(" ")).toContain(
      "voice-call button",
    );
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
  it("explains permission denial and permits retry", async () => {
    media();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new DOMException("Denied", "NotAllowedError"),
    );
    const { result } = renderHook(() => useCalls());
    await act(async () => {
      await expect(
        result.current.start("alice_bob", "bob", "voice"),
      ).rejects.toThrow("blocked access");
    });
    expect(result.current.mediaIssue?.title).toBe("Allow microphone access");
    await act(() => result.current.start("alice_bob", "bob", "voice"));
    expect(result.current.mediaIssue).toBeNull();
    expect(result.current.active).toBeTruthy();
  });
  it("creates a real signaling offer and releases all local media on hangup", async () => {
    const { stop, close } = media();
    const { result } = renderHook(() => useCalls());
    await act(() => result.current.start("alice_bob", "bob", "voice"));
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: true,
      video: false,
    });
    expect(mocks.setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        caller: "alice",
        callee: "bob",
        offer: { type: "offer", sdp: "test-sdp" },
        state: "ringing",
      }),
    );
    expect(result.current.active?.id).toBe("test-call");
    await act(() => result.current.finish());
    expect(stop).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(result.current.active).toBeNull();
  });
  it("recovers from denied permission and permits retry", async () => {
    media();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new Error("Permission denied"),
    );
    const { result } = renderHook(() => useCalls());
    await act(async () => {
      await expect(
        result.current.start("alice_bob", "bob", "voice"),
      ).rejects.toThrow("Permission denied");
    });
    expect(result.current.active).toBeNull();
    await act(() => result.current.start("alice_bob", "bob", "voice"));
    expect(result.current.active).toBeTruthy();
  });
  it("stops media when the calling component is unmounted", async () => {
    const { stop } = media();
    const { result, unmount } = renderHook(() => useCalls());
    await act(() => result.current.start("alice_bob", "bob", "video"));
    unmount();
    expect(stop).toHaveBeenCalled();
  });
});
