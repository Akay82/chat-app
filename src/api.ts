import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { deleteUser, updateProfile, signOut } from "firebase/auth";
import { auth, db, rtdb } from "./firebase";
import { ref, remove, goOffline, goOnline } from "firebase/database";
import { directId, messageSchema, usernameSchema } from "./lib";
import type { Chat, Message, Profile } from "./types";
import { validAvatarPhoto } from "./avatar-photo";
import { clearAccountRecovery } from "./recovery";
import { dismissBrowserNotifications } from "./notifications";
export async function logout() {
  const uid = auth.currentUser?.uid;
  const presence = Boolean(import.meta.env.VITE_FIREBASE_DATABASE_URL);
  if (presence) goOffline(rtdb);
  try {
    await signOut(auth);
    if (uid) clearAccountRecovery(uid);
    void dismissBrowserNotifications();
  } catch (error) {
    if (presence) goOnline(rtdb);
    throw error;
  }
}
export const self = () => {
  if (!auth.currentUser) throw Error("Please sign in.");
  return auth.currentUser.uid;
};
export async function saveProfile(input: {
  username: string;
  displayName: string;
  bio: string;
  avatar: string;
  discoverable: boolean;
  showPresence: boolean;
  photoURL?: string | null;
}) {
  const uid = self(),
    username = usernameSchema.parse(input.username),
    ref = doc(db, "users", uid);
  if (
    !input.displayName.trim() ||
    input.displayName.length > 60 ||
    input.bio.length > 240
  )
    throw Error("Name must be 1–60 characters and bio at most 240.");
  if (
    input.photoURL !== undefined &&
    input.photoURL !== null &&
    !validAvatarPhoto(input.photoURL)
  )
    throw Error("Choose a valid profile photo under 32 KB.");
  await runTransaction(db, async (tx) => {
    const old = await tx.get(ref),
      reservation = await tx.get(doc(db, "usernames", username));
    if (reservation.exists() && reservation.data().uid !== uid)
      throw Error("That username is taken.");
    const previous = old.data()?.username;
    if (!reservation.exists()) tx.set(doc(db, "usernames", username), { uid });
    if (previous && previous !== username)
      tx.delete(doc(db, "usernames", previous));
    tx.set(ref, {
      ...input,
      ...(input.photoURL === undefined && old.data()?.photoURL !== undefined
        ? { photoURL: old.data()!.photoURL }
        : {}),
      username,
      uid,
      displayName: input.displayName.trim(),
      createdAt: old.data()?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await updateProfile(auth.currentUser!, { displayName: input.displayName });
}
export async function findUser(name: string): Promise<Profile> {
  const username = usernameSchema.parse(name.replace(/^@/, ""));
  const reservation = await getDoc(doc(db, "usernames", username));
  if (!reservation.exists())
    throw Error("No discoverable account has that username.");
  const p = await getDoc(doc(db, "users", reservation.data().uid));
  if (!p.exists()) throw Error("Account unavailable.");
  return p.data() as Profile;
}
export async function getProfile(uid: string): Promise<Profile | null> {
  const p = await getDoc(doc(db, "users", uid));
  return p.exists() ? (p.data() as Profile) : null;
}
export async function startDirect(other: string) {
  const uid = self();
  if (uid === other)
    throw Error("Choose someone else to start a conversation.");
  const id = directId(uid, other);
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "chats", id),
      existing = await tx.get(ref);
    if (!existing.exists())
      tx.set(ref, {
        kind: "direct",
        members: [uid, other].sort(),
        admin: uid,
        name: "",
        description: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastText: "",
        lastSender: "",
      });
  });
  return id;
}
export async function createGroup(
  name: string,
  description: string,
  members: string[],
) {
  if (!name.trim() || name.length > 60)
    throw Error("Group name must be 1–60 characters.");
  const ref = doc(collection(db, "chats"));
  await setDoc(ref, {
    kind: "group",
    avatar: "sage",
    members: [self()],
    admin: self(),
    name: name.trim(),
    description: description.slice(0, 240),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastText: "",
    lastSender: "",
  });
  for (const uid of [...new Set(members)])
    if (uid !== self()) await changeMember(ref.id, uid, true);
  return ref.id;
}
export async function changeMember(id: string, uid: string, add: boolean) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "chats", id),
      snap = await tx.get(ref);
    if (!snap.exists()) throw Error("Conversation unavailable.");
    const c = snap.data() as Chat;
    tx.update(ref, {
      members: add
        ? [...new Set([...c.members, uid])]
        : c.members.filter((m) => m !== uid),
      updatedAt: serverTimestamp(),
    });
  });
}
export async function sendMessage(
  chatId: string,
  text: string,
  reply: Message["reply"],
  id: string = crypto.randomUUID(),
) {
  const uid = self(),
    content = messageSchema.parse(text);
  const target = doc(db, "chats", chatId, "messages", id);
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(target);
    if (existing.exists()) {
      if (existing.data().sender !== uid)
        throw Error("This message ID is already in use.");
      return;
    }
    transaction.set(target, {
      sender: uid,
      text: content,
      createdAt: serverTimestamp(),
      editedAt: null,
      deleted: false,
      reply,
    });
    transaction.update(doc(db, "chats", chatId), {
      lastText: content.slice(0, 120),
      lastSender: uid,
      updatedAt: serverTimestamp(),
    });
  });
  return id;
}
export async function editMessage(chat: string, id: string, text: string) {
  await updateDoc(doc(db, "chats", chat, "messages", id), {
    text: messageSchema.parse(text),
    editedAt: serverTimestamp(),
  });
}
export async function removeMessage(chat: string, id: string) {
  await updateDoc(doc(db, "chats", chat, "messages", id), {
    text: "",
    deleted: true,
    reply: null,
    editedAt: serverTimestamp(),
  });
}
export async function receipt(chat: string, fields: Record<string, unknown>) {
  await setDoc(doc(db, "chats", chat, "receipts", self()), fields, {
    merge: true,
  });
}
export async function block(uid: string, blocked: boolean) {
  const ref = doc(db, "users", self(), "blocks", uid);
  if (blocked) await setDoc(ref, { createdAt: serverTimestamp() });
  else await deleteDoc(ref);
}
export async function deleteAccount() {
  const user = auth.currentUser;
  if (!user) return;
  // Reauthenticate before touching data, so recent-login rejection cannot strand a live profile.
  if (
    Date.now() - new Date(user.metadata.lastSignInTime || 0).getTime() >
    4 * 60 * 1000
  )
    throw Error(
      "Sign out and sign in again, then delete your account within four minutes.",
    );
  const chats = await getDocs(
    query(
      collection(db, "chats"),
      where("members", "array-contains", user.uid),
      limit(100),
    ),
  );
  if (chats.size === 100)
    throw Error(
      "More than 99 conversations require an operator-assisted deletion.",
    );
  for (const c of chats.docs) {
    const data = c.data();
    if (
      data.kind === "group" &&
      data.admin === user.uid &&
      data.members.length > 1
    )
      await updateDoc(c.ref, {
        admin: data.members.find((m: string) => m !== user.uid),
        updatedAt: serverTimestamp(),
      });
    if (data.kind === "group") await changeMember(c.id, user.uid, false);
  }
  const prefs = await getDocs(
    collection(db, "users", user.uid, "chatPreferences"),
  );
  for (const p of prefs.docs) await deleteDoc(p.ref);
  if (import.meta.env.VITE_FIREBASE_DATABASE_URL)
    await remove(ref(rtdb, `presence/${user.uid}`));
  const blocks = await getDocs(collection(db, "users", user.uid, "blocks"));
  for (const b of blocks.docs) await deleteDoc(b.ref);
  await runTransaction(db, async (tx) => {
    const p = await tx.get(doc(db, "users", user.uid));
    if (p.exists()) {
      tx.delete(doc(db, "usernames", p.data().username));
      tx.delete(p.ref);
    }
  });
  await deleteUser(user);
  clearAccountRecovery(user.uid);
  void dismissBrowserNotifications();
}
export const now = () => Timestamp.now();
