import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
  serverTimestamp,
  setDoc,
  getCountFromServer,
  type Timestamp,
} from "firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle,
  Phone,
  Plus,
  Search,
  Settings as SettingsIcon,
  Users,
  ArrowUpRight,
  LogOut,
  Download,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { auth, db } from "../firebase";
import { useSession } from "../session";
import { getProfile, logout } from "../api";
import { useSettings } from "../store";
import { friendly } from "../lib";
import { Avatar, Empty, Modal } from "../components";
import { useCalls, CallOverlay } from "../calling";
import type { Chat } from "../types";
import { ProfileForm, NewChat, Settings, GroupInfo } from "./Panels";
import Conversation from "./Conversation";
import { ProfileView } from "../ProfileView";
import { useConnectivity, useKeyboardViewport } from "../connectivity";
import {
  showBrowserNotification,
  playAttentionSound,
  dismissBrowserNotifications,
} from "../notifications";
import { notificationPath } from "../chat-behavior";
type Pref = { readAt?: Timestamp; hiddenAt?: Timestamp };
function ChatItem({
  chat,
  selected,
  pref,
  open,
}: {
  chat: Chat;
  selected: boolean;
  pref?: Pref;
  open: () => void;
}) {
  const { user } = useSession();
  const other = chat.members.find((m) => m !== user?.uid);
  const { data: p } = useQuery({
    queryKey: ["profile", other],
    queryFn: () => getProfile(other!),
    enabled: chat.kind === "direct" && Boolean(other),
  });
  const unread =
    chat.lastSender &&
    chat.lastSender !== user?.uid &&
    (chat.updatedAt?.toMillis() || 0) > (pref?.readAt?.toMillis() || 0);
  const { data: unreadCount } = useQuery({
    queryKey: [
      "unread",
      chat.id,
      chat.updatedAt?.toMillis(),
      pref?.readAt?.toMillis(),
    ],
    enabled: Boolean(unread),
    queryFn: async () => {
      const filters = [where("sender", "!=", user!.uid)];
      if (pref?.readAt) filters.push(where("createdAt", ">", pref.readAt));
      return (
        await getCountFromServer(
          query(
            collection(db, "chats", chat.id, "messages"),
            ...filters,
            where("deleted", "==", false),
          ),
        )
      ).data().count;
    },
  });
  return (
    <button className={`chat-item ${selected ? "active" : ""}`} onClick={open}>
      <Avatar
        profile={chat.kind === "direct" ? p : { avatar: chat.avatar }}
        name={chat.kind === "group" ? chat.name : "…"}
      />
      <div className="chat-summary">
        <div>
          <b>
            {chat.kind === "group"
              ? chat.name
              : p?.displayName || "Deleted account"}
          </b>
          <time>
            {chat.updatedAt
              ? formatDistanceToNow(chat.updatedAt.toDate(), {
                  addSuffix: false,
                }).replace("about ", "")
              : ""}
          </time>
        </div>
        <div>
          <span>{chat.lastText || "A new conversation starts here."}</span>
          {unread && (
            <span
              className="unread"
              aria-label={
                unreadCount ? `${unreadCount} unread messages` : "New activity"
              }
            >
              {unreadCount || ""}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
export default function Workspace() {
  const online = useConnectivity();
  useKeyboardViewport();
  const queryClient = useQueryClient();
  const { user, profile } = useSession(),
    nav = useNavigate(),
    { chatId } = useParams();
  const calls = useCalls();
  useEffect(() => {
    const route = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (notificationPath(detail) !== "/") nav(notificationPath(detail));
    };
    const workerRoute = (event: MessageEvent) => {
      if (
        event.data?.type === "gather:open-chat" &&
        notificationPath(event.data.path) !== "/"
      )
        nav(notificationPath(event.data.path));
    };
    window.addEventListener("gather:open-chat", route);
    navigator.serviceWorker?.addEventListener("message", workerRoute);
    return () => {
      window.removeEventListener("gather:open-chat", route);
      navigator.serviceWorker?.removeEventListener("message", workerRoute);
      void dismissBrowserNotifications();
    };
  }, [nav]);
  const [chats, setChats] = useState<Chat[]>([]),
    [prefs, setPrefs] = useState<Record<string, Pref>>({}),
    [blocked, setBlocked] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [tab, setTab] = useState<"all" | "groups" | "unread">("all"),
    [panel, setPanel] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [direct, setDirect] = useState<Chat | null>(null);
  const selectedChat = useRef(chatId);
  selectedChat.current = chatId;
  const first = useRef(true),
    latest = useRef<Record<string, number>>({});
  const toast = useSettings((s) => s.notify);
  const notify = useCallback(
    (message: string) => {
      if (auth.currentUser?.uid === user?.uid) toast(message);
    },
    [user?.uid, toast],
  );
  useEffect(() => {
    if (!user || !profile) return;
    first.current = true;
    return onSnapshot(
      query(
        collection(db, "chats"),
        where("members", "array-contains", user.uid),
        orderBy("updatedAt", "desc"),
        limit(50),
      ),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Chat);
        if (!first.current) {
          for (const c of rows) {
            const t = c.updatedAt?.toMillis() || 0;
            if (
              !snap.metadata.fromCache &&
              (latest.current[c.id] === undefined ||
                t > latest.current[c.id]) &&
              c.lastSender &&
              c.lastSender !== user.uid &&
              c.lastText &&
              (document.hidden ||
                !document.hasFocus() ||
                c.id !== selectedChat.current)
            ) {
              const s = useSettings.getState();
              s.notify(`New message: ${c.lastText}`);
              if (document.hidden || !document.hasFocus())
                void showBrowserNotification(
                  "Gather · New message",
                  "Someone sent you a message.",
                  `/chat/${c.id}`,
                  `gather-message-${c.id}`,
                );
              playAttentionSound();
            }
          }
        }
        first.current = false;
        latest.current = Object.fromEntries(
          rows.map((c) => [c.id, c.updatedAt?.toMillis() || 0]),
        );
        setChats(rows);
        setLoading(false);
      },
      (e) => {
        setError(friendly(e));
        setLoading(false);
      },
    );
  }, [user, profile, nav]);
  useEffect(() => {
    if (!user) return;
    const a = onSnapshot(
      collection(db, "users", user.uid, "chatPreferences"),
      (s) =>
        setPrefs(
          Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Pref])),
        ),
      (e) => notify(friendly(e)),
    );
    const b = onSnapshot(
      collection(db, "users", user.uid, "blocks"),
      (s) => setBlocked(s.docs.map((d) => d.id)),
      (e) => notify(friendly(e)),
    );
    return () => {
      a();
      b();
    };
  }, [user, notify]);
  useEffect(() => {
    setDirect(null);
    if (!chatId || !profile) return;
    return onSnapshot(
      doc(db, "chats", chatId),
      (s) => setDirect(s.exists() ? ({ id: s.id, ...s.data() } as Chat) : null),
      (e) => notify(friendly(e)),
    );
  }, [chatId, profile, notify]);
  const active = direct || chats.find((c) => c.id === chatId);
  const filtered = useMemo(
    () =>
      chats.filter((c) => {
        const pref = prefs[c.id];
        return (
          !(
            pref?.hiddenAt &&
            (c.updatedAt?.toMillis() || 0) <= pref.hiddenAt.toMillis()
          ) &&
          (tab !== "groups" || c.kind === "group") &&
          (tab !== "unread" ||
            (c.lastSender !== user?.uid &&
              (c.updatedAt?.toMillis() || 0) > (pref?.readAt?.toMillis() || 0)))
        );
      }),
    [chats, prefs, tab, user],
  );
  const [searchNames, setSearchNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    const users = [
      ...new Set(
        chats
          .filter((c) => c.kind === "direct")
          .flatMap((c) => c.members.filter((m) => m !== user?.uid)),
      ),
    ];
    void Promise.all(
      users.map(async (uid) => {
        try {
          return [
            uid,
            (
              await queryClient.fetchQuery({
                queryKey: ["profile", uid],
                queryFn: () => getProfile(uid),
              })
            )?.displayName || "Deleted account",
          ];
        } catch {
          return [uid, ""];
        }
      }),
    ).then((rows) => {
      if (live) setSearchNames(Object.fromEntries(rows));
    });
    return () => {
      live = false;
    };
  }, [chats, user, queryClient]);
  const rows = filtered.filter((c) =>
    `${c.name} ${c.lastText} ${c.members.map((m) => searchNames[m] || "").join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  async function hide() {
    if (!active || !user) return;
    await setDoc(
      doc(db, "users", user.uid, "chatPreferences", active.id),
      { hiddenAt: serverTimestamp() },
      { merge: true },
    );
    nav("/");
    setPanel("");
  }
  return (
    <div
      className={`workspace ${chatId ? "has-conversation" : ""} ${online ? "" : "offline"}`}
    >
      {!online && (
        <div className="connection-banner" role="status">
          You’re offline. Drafts stay in this tab. Reconnect to send or retry.
        </div>
      )}
      <nav className="rail">
        <a href="/" className="rail-logo" aria-label="Gather home">
          ✳
        </a>
        <div className="rail-main">
          <button
            className="rail-button selected"
            aria-label="Conversations"
            onClick={() => {
              setTab("all");
              nav("/");
            }}
          >
            <MessageCircle />
          </button>
          <button
            className="rail-button"
            aria-label="Call history"
            onClick={() => setPanel("calls")}
          >
            <Phone />
          </button>
          <button
            className="rail-button"
            aria-label="Groups"
            onClick={() => {
              setTab("groups");
              nav("/");
            }}
          >
            <Users />
          </button>
        </div>
        <div className="rail-bottom">
          <button
            className="rail-button"
            aria-label="Install Gather"
            title="Install Gather"
            onClick={() => window.dispatchEvent(new Event("gather:install"))}
          >
            <Download />
          </button>
          <button
            className="rail-button"
            aria-label="Settings"
            onClick={() => setPanel("settings")}
          >
            <SettingsIcon />
          </button>
          <button
            className="profile-button"
            aria-label="Your profile"
            onClick={() => setPanel("profile")}
          >
            <Avatar small profile={profile} />
          </button>
        </div>
      </nav>
      <aside className="sidebar">
        <header className="sidebar-header">
          <div>
            <span className="eyebrow">A LITTLE CLOSER</span>
            <h1>
              Conversations<span>.</span>
            </h1>
          </div>
          <button
            className="new-button"
            aria-label="New conversation"
            onClick={() => setPanel("new")}
          >
            <Plus size={22} />
          </button>
        </header>
        <label className="search-box">
          <Search size={18} />
          <input
            placeholder="Search your conversations"
            aria-label="Search conversations"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd>⌕</kbd>
        </label>
        <div className="tabs" role="tablist" aria-label="Conversation filter">
          {(["all", "unread", "groups"] as const).map((t) => (
            <button
              role="tab"
              aria-selected={tab === t}
              key={t}
              className={tab === t ? "selected" : ""}
              onClick={() => setTab(t)}
            >
              {t === "all"
                ? "All messages"
                : t === "unread"
                  ? "New activity"
                  : "Groups"}
              {t === "all" && chats.length > 0 && <span>{chats.length}</span>}
            </button>
          ))}
        </div>
        <div className="chat-list">
          {loading ? (
            <div className="skeleton-list">
              {[1, 2, 3, 4].map((n) => (
                <div className="skeleton" key={n} />
              ))}
            </div>
          ) : error ? (
            <div className="inline-error" role="alert">
              {error}
              <p>
                Check your Firebase configuration, deployed rules and indexes.
              </p>
            </div>
          ) : rows.length ? (
            rows.map((c) => (
              <ChatItem
                key={c.id}
                chat={c}
                pref={prefs[c.id]}
                selected={c.id === chatId}
                open={() => nav(`/chat/${c.id}`)}
              />
            ))
          ) : (
            <div className="list-empty">
              <MessageCircle size={30} />
              <h3>
                {search
                  ? "No conversations found."
                  : "Good things start with hello."}
              </h3>
              <p>
                {search
                  ? "Try another name or message."
                  : "Find a friend by username or bring your circle together."}
              </p>
              <button className="text-button" onClick={() => setPanel("new")}>
                Start a conversation <ArrowUpRight size={16} />
              </button>
            </div>
          )}
        </div>
        <button className="group-card" onClick={() => setPanel("group")}>
          <span className="group-icon">
            <Users size={22} />
          </span>
          <span>
            <b>Life’s better together.</b>
            <small>Create a group for your circle.</small>
          </span>
          <Plus size={18} />
        </button>
        <footer className="sidebar-footer">
          <span className="dot" /> Your people, just a message away.
        </footer>
      </aside>
      <main className="conversation-panel">
        {active ? (
          <Conversation
            key={active.id}
            chat={active}
            calls={calls}
            blocked={blocked}
            info={() => setPanel(active.kind === "group" ? "info" : "person")}
            more={() => setPanel("more")}
          />
        ) : chatId ? (
          <Empty title="Conversation unavailable">
            It may have been removed, or you may no longer be a member.{" "}
            <button onClick={() => nav("/")}>Back to conversations</button>
          </Empty>
        ) : (
          <div className="home-empty">
            <div className="home-top">
              <span>YOUR EVERYDAY SPACE TO CONNECT</span>
              <button className="subtle" onClick={() => setPanel("settings")}>
                Make yourself at home ↗
              </button>
            </div>
            <div className="home-center">
              <div className="gather-art">
                <div className="art-circle" />
                <div className="art-bubble one">
                  hello<span>♡</span>
                </div>
                <div className="art-bubble two">
                  hey, you.<span>✳</span>
                </div>
                <span className="art-spark">✳</span>
              </div>
              <span className="eyebrow">LESS DISTANCE. MORE CONNECTION.</span>
              <h2>
                There’s a conversation
                <br />
                waiting to happen.
              </h2>
              <p>
                A quick catch-up. A familiar voice. A little moment together.
                <br />
                Choose a chat or say hello to someone new.
              </p>
              <button className="primary" onClick={() => setPanel("new")}>
                Start something good <ArrowUpRight size={18} />
              </button>
              <button className="text-button" onClick={() => setPanel("group")}>
                <Users size={17} /> Bring your circle together
              </button>
            </div>
            <footer>
              <span>
                <MessageCircle size={16} /> Thoughtful conversations
              </span>
              <span>
                <Phone size={15} /> Closer, in a call
              </span>
              <span>Made for your everyday.</span>
            </footer>
          </div>
        )}
      </main>
      {!profile && user ? (
        <ProfileForm required close={() => setPanel("")} />
      ) : null}
      {profile && panel === "profile" && (
        <ProfileForm close={() => setPanel("")} />
      )}
      {panel === "new" && (
        <NewChat close={() => setPanel("")} open={(id) => nav(`/chat/${id}`)} />
      )}
      {panel === "group" && (
        <NewChat
          group
          close={() => setPanel("")}
          open={(id) => nav(`/chat/${id}`)}
        />
      )}
      {panel === "settings" && (
        <Settings
          close={() => setPanel("")}
          edit={() => setPanel("profile")}
          blocked={blocked}
        />
      )}
      {panel === "info" && active && (
        <GroupInfo chat={active} blocked={blocked} close={() => setPanel("")} />
      )}
      {panel === "calls" && (
        <Modal title="A familiar voice" close={() => setPanel("")}>
          <p className="muted">
            Your 30 most recent calls. Incoming calls arrive while Gather is
            open.
          </p>
          {calls.history.length ? (
            calls.history.map((c) => (
              <button
                className="history-item"
                key={c.id}
                onClick={() => {
                  nav(`/chat/${c.chatId}`);
                  setPanel("");
                }}
              >
                <Phone size={20} />
                <span>
                  <b>
                    {c.kind === "video" ? "Video" : "Voice"} call ·{" "}
                    {c.caller === user?.uid ? "Outgoing" : "Incoming"}
                  </b>
                  <small>
                    {c.state === "ringing" &&
                    c.expiresAt.toMillis() < Date.now()
                      ? "Missed / expired"
                      : c.state}{" "}
                    ·{" "}
                    {c.createdAt
                      ? formatDistanceToNow(c.createdAt.toDate(), {
                          addSuffix: true,
                        })
                      : "Just now"}
                  </small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))
          ) : (
            <Empty title="Make time for a voice.">
              Call someone from a private conversation.
            </Empty>
          )}
        </Modal>
      )}
      {panel === "more" && active && (
        <Modal title="Conversation options" close={() => setPanel("")}>
          <button
            className="settings-row"
            onClick={() => void hide().catch((e) => notify(friendly(e)))}
          >
            Hide from my conversation list
          </button>
          <p className="muted">
            Shared messages remain. New activity brings this conversation back.
          </p>
          {active.kind === "group" && (
            <button className="settings-row" onClick={() => setPanel("info")}>
              Group details
            </button>
          )}
          <button
            className="settings-row"
            onClick={() => {
              setPanel("");
              window.dispatchEvent(new Event("gather:install"));
            }}
          >
            <Download size={18} /> Install Gather
          </button>
          <button
            className="settings-row"
            onClick={() => void logout().catch((e) => notify(friendly(e)))}
          >
            <LogOut size={18} /> Sign out
          </button>
        </Modal>
      )}
      {panel === "person" && active && (
        <ProfileView
          uid={active.members.find((m) => m !== user?.uid)!}
          blocked={blocked.includes(
            active.members.find((m) => m !== user?.uid)!,
          )}
          close={() => setPanel("")}
        />
      )}
      <CallOverlay calls={calls} />
    </div>
  );
}
