/* No message contents are cached. Notification clicks focus the app and route to the chat. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const value = event.notification.data?.path;
  const path =
    typeof value === "string" && /^\/chat\/[A-Za-z0-9_-]{1,256}$/.test(value)
      ? value
      : "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client =
        windows.find((w) => new URL(w.url).pathname === path) ||
        windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (client) {
        client.postMessage({ type: "gather:open-chat", path });
        await client.focus();
      } else
        await self.clients.openWindow(new URL(path, self.location.origin).href);
    })(),
  );
});
