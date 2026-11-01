import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  collection,
  doc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  orderBy,
  query,
  limit,
  serverTimestamp,
  setDoc,
  deleteDoc,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
  type QuerySnapshot,
} from "firebase/firestore";
import { onValue, ref } from "firebase/database";
import { format, isSameDay, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  ArrowDown,
  Phone,
  Video,
  MoreHorizontal,
  Search,
  Smile,
  Paperclip,
  Send,
  Check,
  CheckCheck,
  Clock,
  Reply,
  X,
  Pencil,
  Trash,
  Copy,
  ShieldBan,
} from "lucide-react";
import { db, rtdb } from "../firebase";
import { useSession } from "../session";
import { useSettings } from "../store";
import {
  getProfile,
  sendMessage,
  editMessage,
  removeMessage,
  receipt,
  block,
} from "../api";
import { friendly, safeUrl } from "../lib";
import { Avatar, Empty } from "../components";
import type { Chat, Message, Receipt } from "../types";
import type { CallController } from "../calling";
import {
  readDraft,
  readOutbox,
  saveRecovery,
  type Outbox,
  type Draft,
} from "../recovery";
import {
  messageMatches,
  messageStatus,
  isReplySwipe,
  messageOrder,
} from "../chat-behavior";
import { useConnectivity } from "../connectivity";
import { ProfileView } from "../ProfileView";
const EmojiMenu = lazy(() => import("../EmojiMenu"));
function MessageText({ text, term = "" }: { text: string; term?: string }) {
  function highlight(value: string) {
    const needle = term.trim().toLowerCase();
    if (!needle) return value;
    const lower = value.toLowerCase(),
      parts = [];
    let position = 0,
      index = lower.indexOf(needle);
    while (index >= 0) {
      parts.push(
        value.slice(position, index),
        <mark key={index}>{value.slice(index, index + needle.length)}</mark>,
      );
      position = index + needle.length;
      index = lower.indexOf(needle, position);
    }
    parts.push(value.slice(position));
    return parts;
  }
  return (
    <>
      {text.split(/(https?:\/\/[^\s]+)/g).map((s, i) =>
        safeUrl(s) ? (
          <a
            key={i}
            href={safeUrl(s)!}
            target="_blank"
            rel="noopener noreferrer"
          >
            {highlight(s)}
          </a>
        ) : (
          highlight(s)
        ),
      )}
    </>
  );
}
function Reactions({
  chat,
  id,
  live,
}: {
  chat: string;
  id: string;
  live: boolean;
}) {
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const { user } = useSession();
  useEffect(() => {
    const target = collection(db, "chats", chat, "messages", id, "reactions");
    let mounted = true;
    const apply = (snap: QuerySnapshot<DocumentData>) => {
      if (mounted)
        setReactions(
          Object.fromEntries(
            snap.docs.map((d) => [d.id, d.data().emoji as string]),
          ),
        );
    };
    const off = live ? onSnapshot(target, apply, () => {}) : undefined;
    if (!live)
      void getDocs(target)
        .then(apply)
        .catch(() => {});
    return () => {
      mounted = false;
      off?.();
    };
  }, [chat, id, live]);
  const counts = Object.values(reactions).reduce<Record<string, number>>(
    (a, e) => ({ ...a, [e]: (a[e] || 0) + 1 }),
    {},
  );
  return (
    <div className="reactions">
      {Object.entries(counts).map(([emoji, count]) => (
        <button
          key={emoji}
          aria-label={`${emoji}, ${count} reactions`}
          className={reactions[user!.uid] === emoji ? "mine" : ""}
          onClick={() => {
            const target = doc(
              db,
              "chats",
              chat,
              "messages",
              id,
              "reactions",
              user!.uid,
            );
            void (
              reactions[user!.uid] === emoji
                ? deleteDoc(target)
                : setDoc(target, { emoji })
            ).catch((e) => useSettings.getState().notify(friendly(e)));
          }}
        >
          {emoji} {count}
        </button>
      ))}
    </div>
  );
}
export default function Conversation({
  chat,
  calls,
  blocked,
  info,
  more,
}: {
  chat: Chat;
  calls: CallController;
  blocked: string[];
  info: () => void;
  more: () => void;
}) {
  const { user } = useSession(),
    nav = useNavigate(),
    notify = useSettings((s) => s.notify);
  const uid = user!.uid,
    other = chat.members.find((m) => m !== uid);
  const online = useConnectivity();
  const [initialDraft] = useState(() => readDraft(uid, chat.id));
  const { data: person } = useQuery({
    queryKey: ["profile", other],
    queryFn: () => getProfile(other!),
    enabled: chat.kind === "direct" && !!other,
  });
  const [messages, setMessages] = useState<Message[]>([]),
    [older, setOlder] = useState<Message[]>([]),
    [pending, setPending] = useState<Outbox>(() => readOutbox(uid, chat.id)),
    [receipts, setReceipts] = useState<Record<string, Receipt>>({}),
    [text, setText] = useState(initialDraft.text),
    [reply, setReply] = useState<Pick<
      Message,
      "id" | "text" | "deleted"
    > | null>(
      initialDraft.reply ? { ...initialDraft.reply, deleted: false } : null,
    ),
    [editing, setEditing] = useState<Message | null>(null),
    [search, setSearch] = useState(""),
    [showSearch, setShowSearch] = useState(false),
    [emoji, setEmoji] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [hasOlder, setHasOlder] = useState(false),
    [now, setNow] = useState(Date.now()),
    [presence, setPresence] = useState<{
      online: boolean;
      lastSeen: number;
    } | null>(null),
    [reactionFor, setReactionFor] = useState(""),
    [matchId, setMatchId] = useState(""),
    [profileUid, setProfileUid] = useState(""),
    [toolsFor, setToolsFor] = useState("");
  const markVisible = useRef<() => void>(() => {});
  const recoveryWarning = useRef(false),
    editBackup = useRef<Draft>({ text: "", reply: null }),
    paging = useRef(false),
    sending = useRef(new Set<string>()),
    gesture = useRef<{ id: string; x: number; y: number; at: number } | null>(
      null,
    );
  useEffect(() => {
    if (editing) return;
    const saved = saveRecovery(uid, chat.id, "draft", {
      text,
      reply: reply ? { id: reply.id, text: reply.text.slice(0, 120) } : null,
    });
    if (!saved && !recoveryWarning.current) {
      recoveryWarning.current = true;
      notify(
        "Browser storage is unavailable. Keep this tab open to retain drafts.",
      );
    }
  }, [text, reply, editing, uid, chat.id, notify]);
  useEffect(() => {
    if (
      !saveRecovery(uid, chat.id, "outbox", pending) &&
      !recoveryWarning.current
    ) {
      recoveryWarning.current = true;
      notify(
        "Browser storage is unavailable. Keep this tab open to retain unsent messages.",
      );
    }
  }, [pending, uid, chat.id, notify]);
  const cursor = useRef<QueryDocumentSnapshot<DocumentData> | null>(null),
    initialized = useRef(false),
    lastTyping = useRef(0),
    end = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true),
    mounted = useRef(true),
    input = useRef<HTMLTextAreaElement>(null),
    emojiButton = useRef<HTMLButtonElement>(null),
    seen = useRef(""),
    allMessages = [...older, ...messages]
      .filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i)
      .sort(messageOrder);
  const closeEmoji = useCallback(() => setEmoji(false), []);
  function insertEmoji(value: string) {
    const start = input.current?.selectionStart ?? text.length,
      end = input.current?.selectionEnd ?? start;
    if (text.length - (end - start) + value.length > 4000) {
      notify("Messages can contain up to 4,000 characters.");
      return;
    }
    setText((current) => current.slice(0, start) + value + current.slice(end));
    requestAnimationFrame(() => {
      input.current?.focus({ preventScroll: true });
      input.current?.setSelectionRange(
        start + value.length,
        start + value.length,
      );
    });
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void receipt(chat.id, { typingUntil: 0 }).catch(() => {});
    };
  }, [chat.id]);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(interval);
  }, []);
  useEffect(
    () =>
      onSnapshot(
        query(
          collection(db, "chats", chat.id, "messages"),
          orderBy("createdAt", "desc"),
          limit(40),
        ),
        { includeMetadataChanges: true },
        (snap) => {
          const list = snap.docs
            .map(
              (d) =>
                ({
                  id: d.id,
                  ...d.data(),
                  pending: d.metadata.hasPendingWrites,
                }) as Message,
            )
            .reverse();
          setMessages((previous) => {
            const retained = previous.filter(
              (m) => !list.some((n) => n.id === m.id),
            );
            if (retained.length)
              setOlder((old) =>
                [...old, ...retained].filter(
                  (m, i, a) => a.findIndex((n) => n.id === m.id) === i,
                ),
              );
            return list;
          });
          if (!initialized.current && !snap.metadata.fromCache) {
            initialized.current = true;
            cursor.current = snap.docs.at(-1) || null;
            setHasOlder(snap.size === 40);
          }
          setLoading(false);
          setPending((previous) =>
            Object.fromEntries(
              Object.entries(previous).filter(
                ([id]) => !list.some((m) => m.id === id && !m.pending),
              ),
            ),
          );
        },
        (e) => {
          setLoading(false);
          setError(friendly(e));
        },
      ),
    [chat.id],
  );
  useEffect(
    () =>
      onSnapshot(
        collection(db, "chats", chat.id, "receipts"),
        (snap) =>
          setReceipts(
            Object.fromEntries(
              snap.docs.map((d) => [d.id, d.data() as Receipt]),
            ),
          ),
        (e) => notify(friendly(e)),
      ),
    [chat.id, notify],
  );
  useEffect(() => {
    if (
      chat.kind !== "direct" ||
      !other ||
      !person?.showPresence ||
      !import.meta.env.VITE_FIREBASE_DATABASE_URL
    )
      return;
    return onValue(
      ref(rtdb, `presence/${other}`),
      (s) => setPresence(s.val()),
      () => setPresence(null),
    );
  }, [chat.kind, other, person?.showPresence]);
  const latest = messages.at(-1);
  useEffect(() => {
    if (!latest || latest.pending || !latest.createdAt) return;
    const mark = () => {
      if (!navigator.onLine) return;
      const reading =
        !document.hidden && document.hasFocus() && nearBottom.current;
      const key = latest.id + String(reading);
      if (seen.current === key) return;
      seen.current = key;
      void receipt(chat.id, {
        deliveredAt: serverTimestamp(),
        ...(reading ? { readAt: serverTimestamp() } : {}),
      }).catch((e) => notify(friendly(e)));
      if (reading)
        void setDoc(
          doc(db, "users", uid, "chatPreferences", chat.id),
          { readAt: serverTimestamp() },
          { merge: true },
        ).catch((e) => notify(friendly(e)));
    };
    mark();
    markVisible.current = mark;
    document.addEventListener("visibilitychange", mark);
    window.addEventListener("focus", mark);
    window.addEventListener("online", mark);
    return () => {
      document.removeEventListener("visibilitychange", mark);
      window.removeEventListener("focus", mark);
      window.removeEventListener("online", mark);
      markVisible.current = () => {};
    };
  }, [latest, uid, chat.id, notify]);
  useEffect(() => {
    if (nearBottom.current) end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);
  async function loadOlder() {
    if (!cursor.current || paging.current || busy || !online) return;
    paging.current = true;
    setBusy(true);
    const before = scroll.current?.scrollHeight || 0;
    try {
      const snap = await getDocsFromServer(
        query(
          collection(db, "chats", chat.id, "messages"),
          orderBy("createdAt", "desc"),
          startAfter(cursor.current),
          limit(40),
        ),
      );
      cursor.current = snap.docs.at(-1) || null;
      setOlder((old) => [
        ...old,
        ...snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Message),
      ]);
      setHasOlder(snap.size === 40);
      requestAnimationFrame(() => {
        if (scroll.current)
          scroll.current.scrollTop = scroll.current.scrollHeight - before;
      });
    } catch (e) {
      notify(friendly(e));
    } finally {
      paging.current = false;
      setBusy(false);
    }
  }
  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    if (editing) {
      if (!online) {
        notify("Reconnect to save message edits. Your edit is still here.");
        return;
      }
      setBusy(true);
      try {
        await editMessage(chat.id, editing.id, text);
        setEditing(null);
        setText(editBackup.current.text);
        setReply(
          editBackup.current.reply
            ? { ...editBackup.current.reply, deleted: false }
            : null,
        );
      } catch (e) {
        notify(friendly(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (Object.keys(pending).length >= 20) {
      notify("Retry or dismiss an unsent message before sending more.");
      return;
    }
    const id = crypto.randomUUID(),
      content = text.trim(),
      quote = reply
        ? {
            id: reply.id,
            text: reply.deleted ? "Message removed" : reply.text.slice(0, 120),
          }
        : null;
    setText("");
    setReply(null);
    const unsent = {
      text: content,
      reply: quote,
      ...(!online ? { error: "You’re offline. Reconnect, then retry." } : {}),
    };
    saveRecovery(uid, chat.id, "outbox", { ...pending, [id]: unsent });
    saveRecovery(uid, chat.id, "draft", { text: "", reply: null });
    setPending((p) => ({ ...p, [id]: unsent }));
    nearBottom.current = true;
    void receipt(chat.id, { typingUntil: 0 }).catch(() => {});
    if (!online) return;
    sending.current.add(id);
    try {
      await sendMessage(chat.id, content, quote, id);
      if (mounted.current)
        setPending((p) => {
          const n = { ...p };
          delete n[id];
          return n;
        });
    } catch (e) {
      if (mounted.current)
        setPending((p) => ({
          ...p,
          [id]: { text: content, reply: quote, error: friendly(e) },
        }));
    } finally {
      sending.current.delete(id);
    }
  }
  async function retry(id: string) {
    const p = pending[id];
    if (!p || sending.current.has(id) || !online || isBlocked) return;
    sending.current.add(id);
    setPending((all) => ({ ...all, [id]: { ...p, error: undefined } }));
    try {
      await sendMessage(chat.id, p.text, p.reply, id);
      setPending((all) => {
        const n = { ...all };
        delete n[id];
        return n;
      });
    } catch (e) {
      setPending((all) => ({ ...all, [id]: { ...p, error: friendly(e) } }));
    } finally {
      sending.current.delete(id);
    }
  }
  const isBlocked = !!other && blocked.includes(other),
    typing = Object.entries(receipts).filter(
      ([id, r]) => id !== uid && (r.typingUntil || 0) > now,
    ),
    name =
      chat.kind === "group"
        ? chat.name
        : person?.displayName || "Deleted account";
  const matches = messageMatches(allMessages, search),
    matchIndex = matches.findIndex((m) => m.id === matchId);
  function jumpTo(id: string) {
    setMatchId(id);
    nearBottom.current = false;
    requestAnimationFrame(() =>
      Array.from(
        scroll.current?.querySelectorAll<HTMLElement>("[data-message-id]") ||
          [],
      )
        .find((element) => element.dataset.messageId === id)
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }
  function nextMatch(direction: number) {
    if (matches.length)
      jumpTo(
        matches[
          matchIndex < 0
            ? direction > 0
              ? 0
              : matches.length - 1
            : (matchIndex + direction + matches.length) % matches.length
        ].id,
      );
  }
  return (
    <>
      <header className="chat-header">
        <button
          className="icon mobile-back"
          aria-label="Back to conversations"
          onClick={() => nav("/")}
        >
          <ArrowLeft />
        </button>
        <button className="chat-person" onClick={info}>
          <Avatar
            profile={chat.kind === "direct" ? person : { avatar: chat.avatar }}
            name={name}
          />
          <span>
            <b>{name}</b>
            <small>
              {typing.length ? (
                "Typing…"
              ) : chat.kind === "group" ? (
                `${chat.members.length} people in your circle`
              ) : presence?.online ? (
                <>
                  <span className="dot" /> Online
                </>
              ) : presence?.lastSeen ? (
                `Last seen ${formatDistanceToNow(presence.lastSeen, { addSuffix: true })}`
              ) : (
                "A little closer, wherever you are"
              )}
            </small>
          </span>
        </button>
        <div className="header-actions">
          {chat.kind === "direct" && (
            <>
              <button
                className="icon"
                aria-label="Start voice call"
                disabled={isBlocked || !!calls.active || !person}
                onClick={() =>
                  void calls
                    .start(chat.id, other!, "voice")
                    .catch((e) => notify(friendly(e)))
                }
              >
                <Phone size={20} />
              </button>
              <button
                className="icon"
                aria-label="Start video call"
                disabled={isBlocked || !!calls.active || !person}
                onClick={() =>
                  void calls
                    .start(chat.id, other!, "video")
                    .catch((e) => notify(friendly(e)))
                }
              >
                <Video size={22} />
              </button>
            </>
          )}
          <span className="header-divider" />
          <button
            className="icon"
            aria-label="Search this chat"
            onClick={() => setShowSearch(!showSearch)}
          >
            <Search size={20} />
          </button>
          <button
            className="icon"
            aria-label="Conversation options"
            onClick={more}
          >
            <MoreHorizontal />
          </button>
        </div>
      </header>
      {showSearch && (
        <div className="chat-search-panel">
          <div className="message-search">
            <Search size={18} />
            <input
              autoFocus
              aria-label="Search messages"
              placeholder="Find a message…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setMatchId("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  nextMatch(e.shiftKey ? -1 : 1);
                }
                if (e.key === "Escape") {
                  setSearch("");
                  setShowSearch(false);
                }
              }}
            />
            <small role="status">
              {search.trim()
                ? `${matchIndex >= 0 ? `${matchIndex + 1} / ` : ""}${matches.length} ${matches.length === 1 ? "match" : "matches"}`
                : "Type to search"}
            </small>
            <button
              className="icon"
              aria-label="Previous search match"
              disabled={!matches.length}
              onClick={() => nextMatch(-1)}
            >
              ↑
            </button>
            <button
              className="icon"
              aria-label="Next search match"
              disabled={!matches.length}
              onClick={() => nextMatch(1)}
            >
              ↓
            </button>
            <button
              className="icon"
              aria-label="Close search"
              onClick={() => {
                setSearch("");
                setShowSearch(false);
              }}
            >
              <X size={18} />
            </button>
          </div>
          <div className="search-scope">
            <span>
              {allMessages.length} messages searched
              {!hasOlder ? " · Beginning of chat reached" : ""}
            </span>
            {hasOlder && (
              <button
                disabled={busy || !online}
                onClick={() => void loadOlder()}
              >
                {busy ? "Searching…" : "Search earlier messages"}
              </button>
            )}
          </div>
          {search.trim() && (
            <div className="search-results" aria-label="Search results">
              {matches.length ? (
                matches
                  .slice()
                  .reverse()
                  .map((m) => (
                    <button
                      key={m.id}
                      className={matchId === m.id ? "selected" : ""}
                      onClick={() => jumpTo(m.id)}
                    >
                      <span>{m.text.slice(0, 180)}</span>
                      <small>
                        {m.createdAt
                          ? format(m.createdAt.toDate(), "MMM d · HH:mm")
                          : ""}
                      </small>
                    </button>
                  ))
              ) : (
                <p>
                  No matches in these messages.
                  {hasOlder ? " Search earlier messages to keep looking." : ""}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <div className="conversation-caption">
        <span className="tiny-flower">✳</span> A little space for the two of you
        {chat.kind === "group" ? " — and your circle" : ""}. Only members can
        read this chat.
      </div>
      <section
        ref={scroll}
        className="messages"
        aria-label="Messages"
        onScroll={() => {
          if (scroll.current) {
            nearBottom.current =
              scroll.current.scrollHeight -
                scroll.current.scrollTop -
                scroll.current.clientHeight <
              120;
            if (nearBottom.current) markVisible.current();
            if (scroll.current.scrollTop < 30 && hasOlder && !busy)
              void loadOlder();
          }
        }}
      >
        {hasOlder && (
          <button
            className="older"
            disabled={busy}
            onClick={() => void loadOlder()}
          >
            {busy ? "Loading…" : "Load earlier messages"}
          </button>
        )}
        {loading ? (
          <div className="skeleton-list">
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        ) : error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : !allMessages.length && !Object.keys(pending).length ? (
          <Empty title="Say a little hello.">
            This is the beginning of a good conversation.
          </Empty>
        ) : null}
        {allMessages.map((m, index) => {
          const own = m.sender === uid,
            stamp = m.createdAt?.toDate(),
            previous = allMessages[index - 1]?.createdAt?.toDate(),
            status = messageStatus(m, chat.members, uid, receipts);
          return (
            <div key={m.id}>
              {stamp && (!previous || !isSameDay(stamp, previous)) && (
                <div className="date-separator">
                  <span>{format(stamp, "EEEE, MMMM d")}</span>
                </div>
              )}
              <div
                data-message-id={m.id}
                className={`message-row ${own ? "own" : ""} ${matchId === m.id ? "search-target" : ""}`}
                onTouchStart={(event) => {
                  if (
                    m.deleted ||
                    isBlocked ||
                    editing ||
                    event.touches.length !== 1 ||
                    (event.target as HTMLElement).closest(
                      "a,button,input,textarea",
                    )
                  ) {
                    gesture.current = null;
                    return;
                  }
                  gesture.current = {
                    id: m.id,
                    x: event.touches[0].clientX,
                    y: event.touches[0].clientY,
                    at: Date.now(),
                  };
                }}
                onTouchMove={(event) => {
                  const start = gesture.current;
                  if (
                    start &&
                    (event.touches.length !== 1 ||
                      Math.abs(event.touches[0].clientY - start.y) > 28)
                  )
                    gesture.current = null;
                }}
                onTouchCancel={() => {
                  gesture.current = null;
                }}
                onTouchEnd={(event) => {
                  const start = gesture.current;
                  gesture.current = null;
                  const touch = event.changedTouches[0];
                  if (
                    start?.id === m.id &&
                    touch &&
                    isReplySwipe(
                      touch.clientX - start.x,
                      touch.clientY - start.y,
                      Date.now() - start.at,
                    )
                  ) {
                    setReply(m);
                    input.current?.focus();
                  }
                }}
              >
                <article className={`bubble ${m.deleted ? "deleted" : ""}`}>
                  {chat.kind === "group" && !own && (
                    <Sender
                      uid={m.sender}
                      open={() => setProfileUid(m.sender)}
                    />
                  )}
                  {m.reply && (
                    <button
                      type="button"
                      className="reply-quote"
                      onClick={() => {
                        if (
                          allMessages.some(
                            (message) => message.id === m.reply!.id,
                          )
                        )
                          jumpTo(m.reply!.id);
                        else {
                          setShowSearch(true);
                          notify(
                            "Load earlier messages to reach the original reply.",
                          );
                        }
                      }}
                      aria-label="Jump to quoted message"
                    >
                      <Reply size={13} />
                      <span>{m.reply.text}</span>
                    </button>
                  )}
                  <p>
                    {m.deleted ? (
                      "This message was removed."
                    ) : (
                      <MessageText
                        text={m.text}
                        term={showSearch ? search : ""}
                      />
                    )}
                  </p>
                  <div className="message-meta">
                    {m.editedAt && !m.deleted && <span>edited</span>}
                    <time>{stamp ? format(stamp, "HH:mm") : "Pending"}</time>
                    {own &&
                      (status === "Sending" ? (
                        <Clock size={13} aria-label="Pending" />
                      ) : status === "Read" ? (
                        <CheckCheck
                          className="read"
                          size={15}
                          aria-label="Read by all members"
                        />
                      ) : status === "Delivered" ? (
                        <CheckCheck
                          size={15}
                          aria-label="Delivered to active conversation views"
                        />
                      ) : (
                        <Check size={14} aria-label="Sent to server" />
                      ))}
                    {own && (
                      <span
                        className={`delivery-status ${status === "Read" ? "read" : ""}`}
                        title={
                          status === "Read"
                            ? "Read by all other members"
                            : status === "Delivered"
                              ? "Received in all other members’ conversation views"
                              : status === "Sent"
                                ? "Saved to the server"
                                : "Waiting for server confirmation"
                        }
                      >
                        {status}
                      </span>
                    )}
                  </div>
                  {!m.deleted && (
                    <>
                      <button
                        type="button"
                        className="message-menu-toggle"
                        aria-label="Message actions"
                        aria-expanded={toolsFor === m.id}
                        aria-controls={`message-actions-${m.id}`}
                        onClick={() =>
                          setToolsFor(toolsFor === m.id ? "" : m.id)
                        }
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      <div
                        id={`message-actions-${m.id}`}
                        className={`message-tools ${toolsFor === m.id ? "open" : ""}`}
                      >
                        <button
                          aria-label="Reply to message"
                          disabled={Boolean(editing) || isBlocked}
                          onClick={() => {
                            setReply(m);
                            input.current?.focus();
                          }}
                        >
                          <Reply size={14} />
                        </button>
                        <button
                          aria-label="Copy message"
                          onClick={() =>
                            void navigator.clipboard
                              .writeText(m.text)
                              .then(() => notify("Message copied."))
                              .catch((e) => notify(friendly(e)))
                          }
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          aria-label="React to message"
                          onClick={() =>
                            setReactionFor(reactionFor === m.id ? "" : m.id)
                          }
                        >
                          <Smile size={14} />
                        </button>
                        {own && (
                          <>
                            <button
                              aria-label="Edit message"
                              disabled={Boolean(editing) || isBlocked}
                              onClick={() => {
                                editBackup.current = {
                                  text,
                                  reply: reply
                                    ? {
                                        id: reply.id,
                                        text: reply.text.slice(0, 120),
                                      }
                                    : null,
                                };
                                setReply(null);
                                setEditing(m);
                                setText(m.text);
                                input.current?.focus();
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              aria-label="Delete message"
                              onClick={() =>
                                void removeMessage(chat.id, m.id).catch((e) =>
                                  notify(friendly(e)),
                                )
                              }
                            >
                              <Trash size={14} />
                            </button>
                          </>
                        )}
                      </div>
                      {reactionFor === m.id && (
                        <div className="reaction-picker">
                          {["❤️", "👍", "😂", "🎉", "😮", "🙏"].map((e) => (
                            <button
                              key={e}
                              aria-label={`React ${e}`}
                              onClick={() => {
                                void setDoc(
                                  doc(
                                    db,
                                    "chats",
                                    chat.id,
                                    "messages",
                                    m.id,
                                    "reactions",
                                    uid,
                                  ),
                                  { emoji: e },
                                ).catch((err) => notify(friendly(err)));
                                setReactionFor("");
                              }}
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      )}
                      <Reactions
                        chat={chat.id}
                        id={m.id}
                        live={messages.some((message) => message.id === m.id)}
                      />
                    </>
                  )}
                </article>
              </div>
            </div>
          );
        })}
        {Object.entries(pending)
          .filter(([id]) => !allMessages.some((m) => m.id === id))
          .map(([id, p]) => (
            <div className="message-row own" key={id}>
              <article className="bubble">
                {p.reply && (
                  <div className="reply-quote">
                    <Reply size={13} />
                    <span>{p.reply.text}</span>
                  </div>
                )}
                <p>{p.text}</p>
                <div className="message-meta">
                  <Clock size={13} />
                  {p.error
                    ? !online
                      ? "Waiting for connection"
                      : p.unconfirmed
                        ? "Delivery not confirmed"
                        : "Failed · retry available"
                    : "Sending…"}
                </div>
                {p.error && (
                  <>
                    <p className="error">{p.error}</p>
                    <button
                      className="retry-send"
                      disabled={!online || isBlocked}
                      onClick={() => void retry(id)}
                    >
                      Retry message
                    </button>
                    <button
                      onClick={() =>
                        setPending((all) => {
                          const n = { ...all };
                          delete n[id];
                          return n;
                        })
                      }
                    >
                      Dismiss
                    </button>
                  </>
                )}
              </article>
            </div>
          ))}
        <div ref={end} />
      </section>
      <button
        className="to-latest icon"
        aria-label="Scroll to newest message"
        onClick={() => {
          nearBottom.current = true;
          end.current?.scrollIntoView({ behavior: "smooth" });
        }}
      >
        <ArrowDown size={17} />
      </button>
      {typing.length > 0 && (
        <div className="typing" aria-live="polite">
          <span>•••</span>{" "}
          {chat.kind === "group"
            ? `${typing.length} ${typing.length === 1 ? "person is" : "people are"}`
            : name + " is"}{" "}
          typing
        </div>
      )}
      <footer className={`composer-area ${showSearch ? "search-is-open" : ""}`}>
        {chat.kind === "direct" && other && (
          <button
            className="block-link"
            onClick={() =>
              void block(other, !isBlocked).catch((e) => notify(friendly(e)))
            }
          >
            <ShieldBan size={12} />
            {isBlocked ? "Unblock this person" : "Block contact"}
          </button>
        )}
        {(reply || editing) && (
          <div className="compose-context">
            <Reply size={17} />
            <span>
              <b>
                {editing ? "Editing your message" : "Replying to a message"}
              </b>
              <small>{(editing || reply)?.text.slice(0, 100)}</small>
            </span>
            <button
              className="icon"
              aria-label="Cancel reply or edit"
              onClick={() => {
                setReply(null);
                setEditing(null);
                if (editing) {
                  setText(editBackup.current.text);
                  setReply(
                    editBackup.current.reply
                      ? { ...editBackup.current.reply, deleted: false }
                      : null,
                  );
                }
              }}
            >
              <X size={18} />
            </button>
          </div>
        )}
        {emoji && !isBlocked && (
          <Suspense
            fallback={
              <span className="emoji-loading" role="status">
                Loading emojis…
              </span>
            }
          >
            <EmojiMenu
              anchor={emojiButton}
              onSelect={insertEmoji}
              onClose={closeEmoji}
            />
          </Suspense>
        )}
        <form className="composer" onSubmit={(e) => void send(e)}>
          <button
            type="button"
            className="icon"
            ref={emojiButton}
            aria-label="Choose emoji"
            aria-expanded={emoji}
            aria-controls="chat-emoji-menu"
            aria-haspopup="dialog"
            disabled={isBlocked}
            onClick={() => setEmoji(!emoji)}
          >
            <Smile size={22} />
          </button>
          <button
            type="button"
            className="icon attachment-disabled"
            aria-label="Attachment uploads unavailable: no storage provider configured"
            title="Uploads need an optional storage provider"
            onClick={() =>
              notify(
                "Attachments are unavailable until a storage provider is configured. Text, links and emoji are ready to send.",
              )
            }
          >
            <Paperclip size={21} />
          </button>
          <textarea
            ref={input}
            aria-label="Write a message"
            placeholder={
              isBlocked
                ? "Unblock this person to send a message"
                : "Write a little something…"
            }
            value={text}
            maxLength={4000}
            disabled={isBlocked}
            rows={1}
            onChange={(e) => {
              setText(e.target.value);
              if (Date.now() - lastTyping.current > 4000) {
                lastTyping.current = Date.now();
                void receipt(chat.id, { typingUntil: Date.now() + 8000 }).catch(
                  () => {},
                );
              }
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            className="send-button"
            aria-label={editing ? "Save message" : "Send message"}
            disabled={!text.trim() || busy || isBlocked}
          >
            {editing ? <Check size={20} /> : <Send size={20} />}
          </button>
        </form>
        <p className="composer-hint">
          Drafts stay in this tab until you sign out.
          <span>Enter to send · Shift + Enter for a new line</span>
        </p>
      </footer>
      {profileUid && (
        <ProfileView
          uid={profileUid}
          blocked={blocked.includes(profileUid)}
          close={() => setProfileUid("")}
        />
      )}
    </>
  );
}
function Sender({ uid, open }: { uid: string; open: () => void }) {
  const { data: p } = useQuery({
    queryKey: ["profile", uid],
    queryFn: () => getProfile(uid),
  });
  return (
    <button
      type="button"
      className="sender-name"
      onClick={open}
      aria-label={`View ${p?.displayName || "sender"} profile`}
    >
      {p?.displayName || "Deleted account"}
    </button>
  );
}
