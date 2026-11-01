import type { Message, Receipt } from "./types";
export function messageOrder(a: Message, b: Message) {
  return (
    (a.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER) -
      (b.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
export function messageMatches(messages: Message[], term: string): Message[] {
  const needle = term.trim().toLocaleLowerCase();
  return needle
    ? messages.filter(
        (m) => !m.deleted && m.text.toLocaleLowerCase().includes(needle),
      )
    : [];
}
export function messageStatus(
  message: Message,
  members: string[],
  uid: string,
  receipts: Record<string, Receipt>,
): "Sending" | "Sent" | "Delivered" | "Read" {
  if (message.pending || !message.createdAt) return "Sending";
  const peers = members.filter((id) => id !== uid),
    time = message.createdAt.toMillis();
  if (
    peers.length &&
    peers.every((id) => (receipts[id]?.readAt?.toMillis() || 0) >= time)
  )
    return "Read";
  if (
    peers.length &&
    peers.every((id) => (receipts[id]?.deliveredAt?.toMillis() || 0) >= time)
  )
    return "Delivered";
  return "Sent";
}
export function isReplySwipe(dx: number, dy: number, duration: number) {
  return (
    dx >= 64 && Math.abs(dy) < 28 && dx > Math.abs(dy) * 2 && duration < 900
  );
}
export function notificationPath(value: unknown): string {
  return typeof value === "string" &&
    /^\/chat\/[A-Za-z0-9_-]{1,256}$/.test(value)
    ? value
    : "/";
}
