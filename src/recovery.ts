import type { Message } from "./types";
export type Draft = { text: string; reply: Message["reply"] };
export type UnsentMessage = Draft & { error?: string; unconfirmed?: boolean };
export type Outbox = Record<string, UnsentMessage>;
const prefix = "gather:recovery:";
function key(uid: string, chat: string, kind: string) {
  return `${prefix}${encodeURIComponent(uid)}:${encodeURIComponent(chat)}:${kind}`;
}
function read(uid: string, chat: string, kind: string): unknown {
  try {
    return JSON.parse(sessionStorage.getItem(key(uid, chat, kind)) || "null");
  } catch {
    return null;
  }
}
function validDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false;
  const d = value as Draft;
  return (
    typeof d.text === "string" &&
    d.text.length <= 4000 &&
    (d.reply === null ||
      Boolean(
        d.reply &&
        typeof d.reply.id === "string" &&
        d.reply.id.length <= 128 &&
        typeof d.reply.text === "string" &&
        d.reply.text.length <= 120,
      ))
  );
}
export function readDraft(uid: string, chat: string): Draft {
  const value = read(uid, chat, "draft");
  return validDraft(value) ? value : { text: "", reply: null };
}
export function readOutbox(uid: string, chat: string): Outbox {
  const value = read(uid, chat, "outbox");
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([id, d]) =>
          /^[a-zA-Z0-9_-]{1,128}$/.test(id) && validDraft(d) && d.text.trim(),
      )
      .slice(0, 20)
      .map(([id, d]) => [
        id,
        {
          ...(d as Draft),
          error: "Not confirmed yet. Retry to check and send safely.",
          unconfirmed: true,
        },
      ]),
  );
}
export function saveRecovery(
  uid: string,
  chat: string,
  kind: "draft" | "outbox",
  value: Draft | Outbox,
): boolean {
  try {
    const empty =
      kind === "draft"
        ? !(value as Draft).text && !(value as Draft).reply
        : Object.keys(value).length === 0;
    if (empty) sessionStorage.removeItem(key(uid, chat, kind));
    else sessionStorage.setItem(key(uid, chat, kind), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function clearAccountRecovery(uid: string) {
  try {
    for (const name of Object.keys(sessionStorage))
      if (name.startsWith(`${prefix}${encodeURIComponent(uid)}:`))
        sessionStorage.removeItem(name);
  } catch {
    /* Storage can be disabled. */
  }
}
