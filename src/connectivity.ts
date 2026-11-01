import { useEffect, useState } from "react";
export function useConnectivity() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
export function useKeyboardViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      if (viewport.scale && Math.abs(viewport.scale - 1) > 0.01) return;
      const mobile = window.matchMedia("(max-width: 760px)").matches;
      document.documentElement.style.setProperty(
        "--chat-height",
        mobile ? `${viewport.height}px` : "100dvh",
      );
      document.documentElement.style.setProperty(
        "--chat-top",
        mobile ? `${viewport.offsetTop}px` : "0px",
      );
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.documentElement.style.removeProperty("--chat-height");
      document.documentElement.style.removeProperty("--chat-top");
    };
  }, []);
}
