import { useSettings } from "./store";
import { notificationPath } from "./chat-behavior";
const active = new Map<string, Notification>();
const versions = new Map<string, number>();
let generation = 0;
export async function showBrowserNotification(
  title: string,
  body: string,
  path: string,
  tag: string,
): Promise<boolean> {
  if (
    !useSettings.getState().notifications ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  )
    return false;
  const options: NotificationOptions = {
    body,
    tag,
    icon: "/icon-192.png",
    data: { path: notificationPath(path) },
  };
  const attempt = generation;
  const version = (versions.get(tag) || 0) + 1;
  versions.set(tag, version);
  const current = () =>
    attempt === generation &&
    versions.get(tag) === version &&
    useSettings.getState().notifications;
  try {
    const registration =
      "serviceWorker" in navigator
        ? await navigator.serviceWorker.getRegistration()
        : undefined;
    if (!current()) return false;
    if (registration?.active) {
      await registration.showNotification(title, options);
      return true;
    }
  } catch {
    /* Try the desktop API if the service worker is unavailable. */
  }
  try {
    if (!current()) return false;
    active.get(tag)?.close();
    const notification = new Notification(title, options);
    active.set(tag, notification);
    notification.onclick = () => {
      window.focus();
      window.dispatchEvent(
        new CustomEvent("gather:open-chat", { detail: options.data.path }),
      );
      notification.close();
    };
    notification.onclose = () => {
      if (active.get(tag) === notification) active.delete(tag);
    };
    return true;
  } catch {
    return false;
  }
}
export async function dismissBrowserNotifications(tag?: string) {
  if (!tag) generation++;
  if (tag) versions.set(tag, (versions.get(tag) || 0) + 1);
  else versions.clear();
  for (const [key, n] of active)
    if (!tag || key === tag) {
      n.close();
      active.delete(key);
    }
  try {
    const registration =
      "serviceWorker" in navigator
        ? await navigator.serviceWorker.getRegistration()
        : undefined;
    const notifications = await registration?.getNotifications(
      tag ? { tag } : {},
    );
    notifications
      ?.filter((n) => n.tag.startsWith("gather-"))
      .forEach((n) => n.close());
  } catch {
    /* Best effort cleanup. */
  }
}
export function playAttentionSound(call = false) {
  if (!useSettings.getState().sound) return;
  try {
    const context = new AudioContext(),
      oscillator = context.createOscillator(),
      gain = context.createGain();
    gain.gain.value = 0.035;
    oscillator.frequency.value = call ? 440 : 650;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (call ? 0.35 : 0.12));
    oscillator.onended = () => void context.close();
  } catch {
    /* Some browsers require a prior user gesture for audio. */
  }
}
