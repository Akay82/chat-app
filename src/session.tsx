import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import {
  ref,
  onValue,
  onDisconnect,
  set,
  serverTimestamp,
  goOnline,
} from "firebase/database";
import { auth, db, rtdb, configured } from "./firebase";
import type { Profile } from "./types";
import { useSettings } from "./store";
import { friendly } from "./lib";
import { clearAccountRecovery } from "./recovery";
const Context = createContext<{
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileError: string | null;
  retryProfile: () => void;
}>({
  user: null,
  profile: null,
  loading: true,
  profileError: null,
  retryProfile: () => {},
});
export const useSession = () => useContext(Context);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [loading, setLoading] = useState(configured);
  const [profileError, setProfileError] = useState<string | null>(null),
    [retryCount, setRetryCount] = useState(0);
  useEffect(() => {
    if (!configured) return;
    let previousUid: string | undefined;
    return onAuthStateChanged(auth, (u) => {
      if (previousUid && previousUid !== u?.uid)
        clearAccountRecovery(previousUid);
      previousUid = u?.uid;
      setProfile(null);
      setProfileError(null);
      setUser(u);
      setLoading(Boolean(u));
    });
  }, []);
  useEffect(() => {
    if (!user) return;
    let live = true;
    const unsubscribe = onSnapshot(
      doc(db, "users", user.uid),
      (s) => {
        if (!live) return;
        setProfile(s.exists() ? (s.data() as Profile) : null);
        setProfileError(null);
        setLoading(false);
      },
      (e) => {
        if (!live) return;
        setLoading(false);
        setProfileError(friendly(e, "profile"));
      },
    );
    return () => {
      live = false;
      unsubscribe();
    };
  }, [user, retryCount]);
  useEffect(() => {
    if (!user || !profile || !import.meta.env.VITE_FIREBASE_DATABASE_URL)
      return;
    const target = ref(rtdb, `presence/${user.uid}`);
    goOnline(rtdb);
    let disposed = false;
    const off = onValue(ref(rtdb, ".info/connected"), async (s) => {
      if (!s.val()) return;
      try {
        await onDisconnect(target).set({
          online: false,
          lastSeen: serverTimestamp(),
          visible: profile.showPresence,
        });
        if (!disposed && auth.currentUser?.uid === user.uid)
          await set(target, {
            online: true,
            lastSeen: serverTimestamp(),
            visible: profile.showPresence,
          });
      } catch (e) {
        if (disposed || auth.currentUser?.uid !== user.uid) return;
        useSettings
          .getState()
          .notify(
            `Presence unavailable: ${e instanceof Error ? e.message : "check database rules"}`,
          );
      }
    });
    const visibility = () => {
      if (auth.currentUser?.uid !== user.uid) return;
      void set(target, {
        online: !document.hidden,
        lastSeen: serverTimestamp(),
        visible: profile.showPresence,
      }).catch(() => {});
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      off();
      document.removeEventListener("visibilitychange", visibility);
      if (auth.currentUser?.uid === user.uid)
        void set(target, {
          online: false,
          lastSeen: serverTimestamp(),
          visible: profile.showPresence,
        }).catch(() => {});
    };
  }, [user, profile]);
  return (
    <Context.Provider
      value={{
        user,
        profile,
        loading,
        profileError,
        retryProfile: () => {
          setProfileError(null);
          setLoading(true);
          setRetryCount((n) => n + 1);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
