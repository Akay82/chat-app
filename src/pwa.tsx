import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Modal } from "./components";
import { useSession } from "./session";
import { Download } from "lucide-react";
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export function Pwa() {
  const { user } = useSession();
  const [online, setOnline] = useState(navigator.onLine),
    [install, setInstall] = useState<InstallEvent | null>(null),
    [showHelp, setShowHelp] = useState(false),
    [installing, setInstalling] = useState(false),
    [swError, setSwError] = useState(""),
    [installError, setInstallError] = useState(""),
    [standalone, setStandalone] = useState(
      () =>
        matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in navigator && navigator.standalone === true),
    );
  const {
    needRefresh: [refresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: () =>
      setSwError(
        "Offline support could not start. Reload Gather and check that your browser allows service workers for this site.",
      ),
  });
  useEffect(() => {
    const on = () => setOnline(navigator.onLine),
      prompt = (e: Event) => {
        e.preventDefault();
        setInstall(e as InstallEvent);
      };
    const open = () => setShowHelp(true),
      installed = () => {
        setStandalone(true);
        setInstall(null);
        setShowHelp(false);
      },
      display = matchMedia("(display-mode: standalone)"),
      displayChanged = () =>
        setStandalone(
          display.matches ||
            ("standalone" in navigator && navigator.standalone === true),
        );
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    window.addEventListener("beforeinstallprompt", prompt);
    window.addEventListener("gather:install", open);
    window.addEventListener("appinstalled", installed);
    display.addEventListener("change", displayChanged);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
      window.removeEventListener("beforeinstallprompt", prompt);
      window.removeEventListener("gather:install", open);
      window.removeEventListener("appinstalled", installed);
      display.removeEventListener("change", displayChanged);
    };
  }, []);
  async function requestInstall() {
    if (!install) {
      setShowHelp(true);
      return;
    }
    setInstalling(true);
    setInstallError("");
    try {
      await install.prompt();
      const choice = await install.userChoice;
      setInstall(null);
      if (choice.outcome === "accepted") setShowHelp(false);
    } catch {
      setInstall(null);
      setInstallError(
        "The browser could not open its install prompt. Use the browser menu instructions below.",
      );
      setShowHelp(true);
    } finally {
      setInstalling(false);
    }
  }
  return (
    <>
      {!online && !user && (
        <div className="network" role="status">
          You’re offline. Reconnect to sign in to Gather.
        </div>
      )}
      {refresh && (
        <div className="pwa-banner">
          A fresh Gather is ready.{" "}
          <button onClick={() => void updateServiceWorker(true)}>Update</button>
        </div>
      )}
      {!standalone && !user && (
        <button
          className="install"
          onClick={() => {
            setShowHelp(true);
          }}
        >
          Install Gather ↗
        </button>
      )}
      {showHelp && (
        <Modal
          title={standalone ? "Gather is installed" : "Take Gather with you"}
          close={() => setShowHelp(false)}
        >
          <p>
            Keep your people a little closer. Install Gather to open it in its
            own window.
          </p>
          {standalone ? (
            <p className="success">
              You’re already using Gather as an installed app.
            </p>
          ) : (
            <>
              {install ? (
                <button
                  className="primary"
                  disabled={installing}
                  onClick={() => void requestInstall()}
                >
                  <Download size={18} />
                  {installing ? "Opening installer…" : "Install Gather"}
                </button>
              ) : (
                <p className="muted">
                  This browser hasn’t offered an automatic install prompt. You
                  can check its install menu or open Gather in a regular
                  browser.
                </p>
              )}
              <ol className="device-help">
                <li>
                  <b>Chrome, Edge or Brave on desktop:</b> look for “Install
                  Gather” or “Install app” in the browser menu or address bar.
                </li>
                <li>
                  <b>Android:</b> open Gather in Chrome and use its menu →
                  Install app or Add to Home screen.
                </li>
                <li>
                  <b>iPhone or iPad:</b> open Gather in Safari → Share → Add to
                  Home Screen.
                </li>
              </ol>
              <p className="muted">
                In-app browser previews may not support installing apps. Open
                this address in your usual browser.
              </p>
              <button
                className="secondary"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(location.href)
                    .then(() =>
                      setInstallError(
                        "Address copied. Open it in your usual browser.",
                      ),
                    )
                    .catch(() =>
                      setInstallError(
                        `Open ${location.origin} in your usual browser.`,
                      ),
                    )
                }
              >
                Copy app address
              </button>
              {["localhost", "127.0.0.1", "[::1]"].includes(
                location.hostname,
              ) && (
                <p className="muted">
                  This is a local development app. Keep its server running. To
                  install on another device, deploy Gather to an HTTPS address
                  first.
                </p>
              )}
            </>
          )}
          {installError && (
            <p role="status" className="muted">
              {installError}
            </p>
          )}
          {swError && (
            <p role="alert" className="error">
              {swError}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
