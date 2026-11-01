import React from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Timestamp } from "firebase/firestore";
import type { Chat, Message } from "../src/types";
import type { CallController } from "../src/calling";
const mock = vi.hoisted(() => ({
  send: vi.fn(),
  edit: vi.fn(),
  receipt: vi.fn(),
  block: vi.fn(),
  older: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("../src/firebase", () => ({ db: {}, rtdb: {} }));
vi.mock("../src/session", () => ({
  useSession: () => ({ user: { uid: "alice" } }),
}));
vi.mock("../src/api", () => ({
  getProfile: async () => ({
    uid: "bob",
    username: "bob",
    displayName: "Bob",
    bio: "Hello there",
    avatar: "sage",
    showPresence: false,
  }),
  sendMessage: mock.send,
  editMessage: mock.edit,
  removeMessage: vi.fn(),
  receipt: mock.receipt,
  block: mock.block,
}));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  }),
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  query: (ref: unknown) => ref,
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  serverTimestamp: () => 1,
  setDoc: async () => {},
  deleteDoc: async () => {},
  getDocs: async () => ({ docs: [] }),
  getDocsFromServer: (...args: unknown[]) => mock.older(...args),
  onSnapshot: (ref: { path: string }, ...args: unknown[]) => {
    const callback = args.find((a) => typeof a === "function") as (
      s: unknown,
    ) => void;
    if (ref.path === "chats/chat/messages")
      callback({
        docs: initialDocs.slice().reverse(),
        size: 40,
        metadata: { fromCache: false, hasPendingWrites: false },
      });
    else callback({ docs: [], metadata: { fromCache: false } });
    return () => {};
  },
}));
import Conversation from "../src/pages/Conversation";
import { useSettings } from "../src/store";
import { saveRecovery, readOutbox, readDraft } from "../src/recovery";
const timestamp = (time: number) =>
  ({ toMillis: () => time, toDate: () => new Date(time) }) as Timestamp;
const msg = (
  id: string,
  text: string,
  sender = "bob",
  deleted = false,
): Message => ({
  id,
  text,
  sender,
  deleted,
  createdAt: timestamp(1700000000000 + Number(id.replace(/\D/g, "")) * 1000),
  editedAt: null,
  reply: null,
});
const snapshot = (message: Message) => ({
  id: message.id,
  data: () => message,
  metadata: { hasPendingWrites: false },
});
const initialDocs = [
  snapshot(msg("m1", "Hello from Alice", "alice")),
  snapshot(msg("m2", "Hello from Bob")),
  snapshot(msg("m3", "Hidden deleted word", "bob", true)),
];
const chat = {
  id: "chat",
  kind: "direct",
  members: ["alice", "bob"],
  name: "Test circle",
} as Chat;
const scrolled = vi.fn();
function open(group = false) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <Conversation
          chat={{ ...chat, kind: group ? "group" : "direct" }}
          calls={{} as CallController}
          blocked={[]}
          info={() => {}}
          more={() => {}}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: function (this: HTMLElement) {
      scrolled(this.dataset.messageId);
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  mock.send.mockResolvedValue("sent");
  mock.edit.mockResolvedValue(undefined);
  mock.receipt.mockResolvedValue(undefined);
  mock.block.mockResolvedValue(undefined);
  mock.older.mockResolvedValue({
    docs: [snapshot(msg("m0", "Earlier pineapple message"))],
    size: 1,
  });
  useSettings.setState({ notify: mock.notify, sound: false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("conversation improvements", () => {
  it("searches earlier history and jumps to a result without removing conversation context", async () => {
    open();
    await screen.findByText("Hello from Bob");
    fireEvent.click(screen.getByRole("button", { name: "Search this chat" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search messages" }), {
      target: { value: "pineapple" },
    });
    expect(screen.getByText(/No matches in these messages/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Search earlier messages" }),
    );
    const result = await screen.findByRole("button", {
      name: /Earlier pineapple message/,
    });
    fireEvent.click(result);
    await waitFor(() => expect(scrolled).toHaveBeenCalledWith("m0"));
    expect(screen.getByText("Hello from Alice")).toBeTruthy();
    expect(screen.getByText(/Beginning of chat reached/)).toBeTruthy();
  });
  it("does not expose deleted text in search results", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Search this chat" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search messages" }), {
      target: { value: "Hidden" },
    });
    expect(screen.getByText(/No matches/)).toBeTruthy();
    expect(screen.queryByText("Hidden deleted word")).toBeNull();
  });
  it("shows failure and retries with the same message ID", async () => {
    mock.send.mockRejectedValueOnce(Error("Server unavailable"));
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Write a message" }), {
      target: { value: "Please retry me" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry message" }),
    );
    await waitFor(() => expect(mock.send).toHaveBeenCalledTimes(2));
    expect(mock.send.mock.calls[0][3]).toBe(mock.send.mock.calls[1][3]);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Retry message" }),
      ).toBeNull(),
    );
  });
  it("retains offline messages for recovery and waits for a connection before retry", async () => {
    open();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    fireEvent(window, new Event("offline"));
    fireEvent.change(screen.getByRole("textbox", { name: "Write a message" }), {
      target: { value: "Offline hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    const retry = await screen.findByRole("button", { name: "Retry message" });
    expect((retry as HTMLButtonElement).disabled).toBe(true);
    expect(mock.send).not.toHaveBeenCalled();
    expect(Object.values(readOutbox("alice", "chat"))[0].text).toBe(
      "Offline hello",
    );
    expect(readDraft("alice", "chat").text).toBe("");
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    fireEvent(window, new Event("online"));
    fireEvent.click(retry);
    await waitFor(() => expect(mock.send).toHaveBeenCalledOnce());
  });
  it("restores a draft and its reply after remounting", () => {
    saveRecovery("alice", "chat", "draft", {
      text: "My draft",
      reply: { id: "m2", text: "Hello from Bob" },
    });
    const view = open();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Write a message",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("My draft");
    expect(screen.getByText("Replying to a message")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Write a message" }), {
      target: { value: "Updated draft" },
    });
    view.unmount();
    open();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Write a message",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Updated draft");
  });
  it("preserves a normal draft when editing and saving an old message", async () => {
    saveRecovery("alice", "chat", "draft", {
      text: "Keep my draft",
      reply: null,
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Write a message" }), {
      target: { value: "Edited greeting" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save message" }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("textbox", {
            name: "Write a message",
          }) as HTMLTextAreaElement
        ).value,
      ).toBe("Keep my draft"),
    );
    expect(mock.edit).toHaveBeenCalledWith("chat", "m1", "Edited greeting");
  });
  it("supports deliberate swipe-to-reply and ignores vertical scrolling", () => {
    const view = open();
    const row = view.container.querySelector('[data-message-id="m2"]')!;
    fireEvent.touchStart(row, { touches: [{ clientX: 10, clientY: 100 }] });
    fireEvent.touchMove(row, { touches: [{ clientX: 80, clientY: 160 }] });
    fireEvent.touchEnd(row, {
      changedTouches: [{ clientX: 100, clientY: 160 }],
    });
    expect(screen.queryByText("Replying to a message")).toBeNull();
    fireEvent.touchStart(row, { touches: [{ clientX: 10, clientY: 100 }] });
    fireEvent.touchEnd(row, {
      changedTouches: [{ clientX: 100, clientY: 105 }],
    });
    expect(screen.getByText("Replying to a message")).toBeTruthy();
  });
  it("opens group sender profiles and blocks from the viewer", async () => {
    open(true);
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "View Bob profile" }))[0],
    );
    expect(await screen.findByText("Hello there")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Block this person" }));
    await waitFor(() => expect(mock.block).toHaveBeenCalledWith("bob", true));
  });
});
