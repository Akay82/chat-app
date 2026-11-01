import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { useSettings } from "../src/store";
import {
  showBrowserNotification,
  dismissBrowserNotifications,
} from "../src/notifications";
const show = vi.fn(),
  getNotifications = vi.fn(),
  getRegistration = vi.fn();
beforeEach(() => {
  useSettings.setState({ notifications: true, sound: false });
  show.mockResolvedValue(undefined);
  getNotifications.mockResolvedValue([]);
  getRegistration.mockResolvedValue({
    active: {},
    showNotification: show,
    getNotifications,
  });
  vi.stubGlobal(
    "Notification",
    class {
      static permission = "granted";
      close = vi.fn();
    },
  );
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration },
  });
});
afterEach(async () => {
  await dismissBrowserNotifications();
  delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("browser notifications", () => {
  it("cancels a pending call notification if the call ends before delivery", async () => {
    let resolve!: (value: unknown) => void;
    getRegistration.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = showBrowserNotification(
      "Gather",
      "Incoming call",
      "/chat/alice_bob",
      "gather-call-pending",
    );
    await dismissBrowserNotifications("gather-call-pending");
    resolve({ active: {}, showNotification: show });
    expect(await pending).toBe(false);
    expect(show).not.toHaveBeenCalled();
  });
  it("uses service-worker notifications for mobile-compatible delivery", async () => {
    expect(
      await showBrowserNotification(
        "Gather",
        "Private preview",
        "/chat/alice_bob",
        "gather-message-chat",
      ),
    ).toBe(true);
    expect(show).toHaveBeenCalledWith(
      "Gather",
      expect.objectContaining({
        body: "Private preview",
        data: { path: "/chat/alice_bob" },
      }),
    );
  });
  it("does not prompt or notify without opt-in and permission", async () => {
    useSettings.setState({ notifications: false });
    expect(
      await showBrowserNotification("Gather", "body", "/", "gather-test"),
    ).toBe(false);
    expect(getRegistration).not.toHaveBeenCalled();
    useSettings.setState({ notifications: true });
    vi.stubGlobal(
      "Notification",
      class {
        static permission = "denied";
      },
    );
    expect(
      await showBrowserNotification("Gather", "body", "/", "gather-test"),
    ).toBe(false);
  });
  it("handles unsupported notification APIs without rejecting", async () => {
    getRegistration.mockResolvedValue(undefined);
    expect(
      await showBrowserNotification("Gather", "body", "/", "gather-test"),
    ).toBe(true);
    vi.stubGlobal(
      "Notification",
      class {
        static permission = "granted";
        constructor() {
          throw Error("Not supported");
        }
      },
    );
    expect(
      await showBrowserNotification("Gather", "body", "/", "gather-test"),
    ).toBe(false);
  });
  it("cancels an in-flight notification after sign-out cleanup", async () => {
    let resolve!: (value: unknown) => void;
    getRegistration.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = showBrowserNotification(
      "Gather",
      "body",
      "/chat/alice_bob",
      "gather-test",
    );
    await dismissBrowserNotifications();
    resolve({ active: {}, showNotification: show });
    expect(await pending).toBe(false);
    expect(show).not.toHaveBeenCalled();
  });
  it("dismisses call alerts when ringing ends", async () => {
    const close = vi.fn();
    getNotifications.mockResolvedValue([{ tag: "gather-call-1", close }]);
    await dismissBrowserNotifications("gather-call-1");
    expect(getNotifications).toHaveBeenCalledWith({ tag: "gather-call-1" });
    expect(close).toHaveBeenCalledOnce();
  });
});
describe("notification click routing", () => {
  async function click(path: string, windows: unknown[]) {
    let listener!: (event: unknown) => void;
    let work!: Promise<void>;
    const openWindow = vi.fn();
    runInNewContext(readFileSync("public/notification-events.js", "utf8"), {
      URL,
      self: {
        location: { origin: "https://gather.test" },
        clients: { matchAll: async () => windows, openWindow },
        addEventListener: (_name: string, callback: typeof listener) => {
          listener = callback;
        },
      },
    });
    const close = vi.fn();
    listener({
      notification: { data: { path }, close },
      waitUntil: (promise: Promise<void>) => {
        work = promise;
      },
    });
    await work;
    return { openWindow, close };
  }
  it("focuses and routes an existing app without reloading an active call", async () => {
    const client = {
      url: "https://gather.test/",
      postMessage: vi.fn(),
      focus: vi.fn(),
    };
    const { openWindow, close } = await click("/chat/alice_bob", [client]);
    expect(client.postMessage).toHaveBeenCalledWith({
      type: "gather:open-chat",
      path: "/chat/alice_bob",
    });
    expect(client.focus).toHaveBeenCalledOnce();
    expect(openWindow).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
  it("opens a safe local route when no window exists", async () => {
    expect(
      (await click("/chat/alice_bob", [])).openWindow,
    ).toHaveBeenCalledWith("https://gather.test/chat/alice_bob");
    expect(
      (await click("https://evil.example", [])).openWindow,
    ).toHaveBeenCalledWith("https://gather.test/");
  });
});
