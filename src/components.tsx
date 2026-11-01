import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { Profile } from "./types";
import { validAvatarPhoto } from "./avatar-photo";
export function Avatar({
  profile,
  name,
  small = false,
}: {
  profile?: Partial<Profile> | null;
  name?: string;
  small?: boolean;
}) {
  const label = profile?.displayName || name || "?";
  const [failed, setFailed] = useState("");
  const photo =
    validAvatarPhoto(profile?.photoURL) && failed !== profile.photoURL
      ? profile.photoURL
      : null;
  return (
    <span
      aria-hidden="true"
      className={`avatar ${profile?.avatar || "sage"} ${small ? "small" : ""}`}
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          decoding="async"
          onError={() => setFailed(photo)}
        />
      ) : (
        label
          .split(" ")
          .slice(0, 2)
          .map((s) => s[0])
          .join("")
          .toUpperCase()
      )}
    </span>
  );
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current,
      previous = document.activeElement as HTMLElement;
    d?.showModal();
    return () => {
      d?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon" aria-label="Close dialog" onClick={close}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark">✳</span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function Attachment({
  url,
  kind,
  name,
}: {
  url: string;
  kind: "image" | "audio" | "file";
  name: string;
}) {
  let safe = false;
  try {
    safe = new URL(url).protocol === "https:";
  } catch {
    /* invalid provider URL */
  }
  if (!safe) return <p>Attachment unavailable</p>;
  return kind === "image" ? (
    <a href={url} target="_blank" rel="noreferrer">
      <img className="attachment" src={url} alt={name} loading="lazy" />
    </a>
  ) : kind === "audio" ? (
    <audio controls src={url} aria-label={name} />
  ) : (
    <a href={url} target="_blank" rel="noreferrer">
      {name} ↗
    </a>
  );
}
