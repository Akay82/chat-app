import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import EmojiPicker from "emoji-picker-react";
import { X } from "lucide-react";
import { useSettings } from "./store";

type Bounds = { left: number; top: number; width: number; height: number };
export default function EmojiMenu({
  anchor,
  onSelect,
  onClose,
}: {
  anchor: RefObject<HTMLButtonElement | null>;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const theme = useSettings((s) => s.theme);
  useLayoutEffect(() => {
    const button = anchor.current;
    if (!button) return;
    const panel =
      button.closest(".conversation-panel") || document.documentElement;
    const composer = button.closest(".composer-area");
    const measure = () => {
      const trigger = button.getBoundingClientRect(),
        chat = panel.getBoundingClientRect(),
        viewport = window.visualViewport;
      const x = viewport?.offsetLeft || 0,
        y = viewport?.offsetTop || 0;
      const left = Math.max(chat.left, x) + 12,
        right =
          Math.min(chat.right, x + (viewport?.width || window.innerWidth)) - 12;
      const top = Math.max(chat.top, y) + 12,
        bottom = Math.min(
          trigger.top - 10,
          chat.bottom - 12,
          y + (viewport?.height || window.innerHeight) - 12,
        );
      const width = Math.max(0, Math.min(360, right - left)),
        height = Math.max(0, Math.min(420, bottom - top));
      setBounds({
        left: Math.max(left, Math.min(trigger.left, right - width)),
        top: bottom - height,
        width,
        height,
      });
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(panel);
    if (composer) resize.observe(composer);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    const dismiss = (event: PointerEvent) => {
      if (
        !menu.current?.contains(event.target as Node) &&
        !button.contains(event.target as Node)
      )
        onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        button.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [anchor, onClose]);
  if (!bounds || bounds.height < 120 || bounds.width < 120) return null;
  return createPortal(
    <div
      id="chat-emoji-menu"
      ref={menu}
      className="chat-emoji-menu"
      role="dialog"
      aria-label="Choose an emoji"
      style={bounds}
    >
      <div className="chat-emoji-menu-head">
        <span>A little more expression</span>
        <button
          type="button"
          className="icon"
          aria-label="Close emoji picker"
          onClick={() => {
            onClose();
            anchor.current?.focus();
          }}
        >
          <X size={16} />
        </button>
      </div>
      <EmojiPicker
        width={bounds.width}
        height={bounds.height - 38}
        colorScheme={theme === "system" ? "auto" : theme}
        emojiStyle="native"
        previewConfig={{ showPreview: false }}
        suggestedEmojisMode="recent"
        searchPlaceholder="Search emojis…"
        searchLabel="Search emojis"
        autoFocusSearch={false}
        onEmojiClick={(data) => onSelect(data.emoji)}
      />
    </div>,
    document.body,
  );
}
