import { afterAll, describe, it, expect } from "vitest";
import { initializeApp, deleteApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  deleteUser,
  verifyPasswordResetCode,
  confirmPasswordReset,
  applyActionCode,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  setDoc,
  serverTimestamp,
  terminate,
} from "firebase/firestore";
import { auth, db } from "../src/firebase";
if (
  import.meta.env.VITE_USE_EMULATORS !== "true" ||
  db.app.options.projectId !== "demo-gather"
)
  throw Error("Integration tests must never use a live Firebase project.");
import {
  saveProfile,
  startDirect,
  sendMessage,
  editMessage,
  removeMessage,
  createGroup,
  changeMember,
  deleteAccount,
} from "../src/api";
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const appB = initializeApp(
  {
    apiKey: "demo-gather-local-only",
    projectId: "demo-gather",
    appId: "local-b",
  },
  "integration-b",
);
const authB = getAuth(appB),
  dbB = getFirestore(appB);
connectAuthEmulator(authB, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(dbB, "127.0.0.1", 8188);
afterAll(async () => {
  await signOut(auth);
  await signOut(authB);
  await terminate(dbB);
  await deleteApp(appB);
});
describe("two authenticated Firebase clients", () => {
  it("registers, reserves names, receives live messages, edits/deletes, and manages group membership", async () => {
    const a = await createUserWithEmailAndPassword(
      auth,
      `alice-${suffix}@gather.test`,
      "Local-test-only-123!",
    );
    await saveProfile({
      username: `alice_${suffix}`,
      displayName: "Alice test",
      photoURL: "data:image/jpeg;base64,/9j/AA==",
      bio: "",
      avatar: "sage",
      discoverable: true,
      showPresence: true,
    });
    await saveProfile({
      username: `alice_${suffix}`,
      displayName: "Alice updated",
      bio: "Profile edit with unchanged username",
      avatar: "peach",
      discoverable: true,
      showPresence: true,
    });
    expect(
      (await getDoc(doc(db, "users", a.user.uid))).data()?.displayName,
    ).toBe("Alice updated");
    expect((await getDoc(doc(db, "users", a.user.uid))).data()?.photoURL).toBe(
      "data:image/jpeg;base64,/9j/AA==",
    );
    await saveProfile({
      username: `alice_${suffix}`,
      displayName: "Alice updated",
      bio: "",
      avatar: "peach",
      discoverable: true,
      showPresence: true,
      photoURL: null,
    });
    expect(
      (await getDoc(doc(db, "users", a.user.uid))).data()?.photoURL,
    ).toBeNull();
    const b = await createUserWithEmailAndPassword(
      authB,
      `bob-${suffix}@gather.test`,
      "Local-test-only-123!",
    );
    // Bob is an independent Firebase Auth session; reserve his profile with the same atomic contract.
    const { writeBatch } = await import("firebase/firestore");
    const batch = writeBatch(dbB);
    batch.set(doc(dbB, "usernames", `bob_${suffix}`), { uid: b.user.uid });
    batch.set(doc(dbB, "users", b.user.uid), {
      uid: b.user.uid,
      username: `bob_${suffix}`,
      displayName: "Bob test",
      bio: "",
      avatar: "sky",
      discoverable: true,
      showPresence: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    const chat = await startDirect(b.user.uid);
    expect(await startDirect(b.user.uid)).toBe(chat);
    let unsubscribe = () => {};
    const received = new Promise<string>((resolve, reject) => {
      unsubscribe = onSnapshot(
        query(
          collection(dbB, "chats", chat, "messages"),
          orderBy("createdAt", "desc"),
          limit(40),
        ),
        (s) => {
          const m = s.docs.find(
            (d) => d.data().text === "Hello across two sessions",
          );
          if (m) resolve(m.id);
        },
        reject,
      );
    });
    const id = await sendMessage(chat, "Hello across two sessions", null);
    expect(await received).toBe(id);
    unsubscribe();
    const originalTimestamp = (
      await getDoc(doc(db, "chats", chat, "messages", id))
    )
      .data()
      ?.createdAt.toMillis();
    await Promise.all([
      sendMessage(chat, "Hello across two sessions", null, id),
      sendMessage(chat, "Hello across two sessions", null, id),
    ]);
    expect(
      (await getDoc(doc(db, "chats", chat, "messages", id)))
        .data()
        ?.createdAt.toMillis(),
    ).toBe(originalTimestamp);
    await editMessage(chat, id, "Edited for Bob");
    await sendMessage(chat, "Hello across two sessions", null, id);
    expect(
      (await getDoc(doc(dbB, "chats", chat, "messages", id))).data()?.text,
    ).toBe("Edited for Bob");
    await removeMessage(chat, id);
    expect(
      (await getDoc(doc(dbB, "chats", chat, "messages", id))).data()?.deleted,
    ).toBe(true);
    const group = await createGroup(
      "Integration circle",
      "A real emulator group",
      [b.user.uid],
    );
    expect((await getDoc(doc(dbB, "chats", group))).data()?.members).toContain(
      b.user.uid,
    );
    await sendMessage(group, "Hello circle", null);
    await setDoc(doc(dbB, "chats", group, "messages", "bob-reply"), {
      sender: b.user.uid,
      text: "Hello Alice",
      createdAt: serverTimestamp(),
      editedAt: null,
      deleted: false,
      reply: null,
    });
    expect(
      (await getDoc(doc(db, "chats", group, "messages", "bob-reply"))).data()
        ?.sender,
    ).toBe(b.user.uid);
    await changeMember(group, b.user.uid, false);
    expect((await getDoc(doc(db, "chats", group))).data()?.members).toEqual([
      a.user.uid,
    ]);
    await deleteAccount();
    expect(auth.currentUser).toBeNull();
    expect((await getDoc(doc(dbB, "users", a.user.uid))).exists()).toBe(false);
    expect(
      (await getDoc(doc(dbB, "usernames", `alice_${suffix}`))).exists(),
    ).toBe(false);
    expect((await getDoc(doc(dbB, "chats", chat))).data()?.members).toContain(
      b.user.uid,
    );
  });
  it("handles signup, verification, logout, wrong passwords, repeat signup, reset and login", async () => {
    await signOut(auth);
    const email = `auth-${suffix}@gather.test`,
      password = "Local-test-only-123!";
    const created = await createUserWithEmailAndPassword(auth, email, password);
    const uid = created.user.uid;
    await sendEmailVerification(created.user);
    const codes = async () =>
      (await (
        await fetch(
          "http://127.0.0.1:9099/emulator/v1/projects/demo-gather/oobCodes",
        )
      ).json()) as {
        oobCodes: { email: string; oobCode: string; requestType: string }[];
      };
    const verification = (await codes()).oobCodes.find(
      (c) => c.email === email && c.requestType === "VERIFY_EMAIL",
    );
    expect(verification).toBeTruthy();
    await applyActionCode(auth, verification!.oobCode);
    await created.user.reload();
    expect(created.user.emailVerified).toBe(true);
    await signOut(auth);
    expect(auth.currentUser).toBeNull();
    await expect(
      signInWithEmailAndPassword(auth, email, "Wrong-password-123!"),
    ).rejects.toMatchObject({
      code: expect.stringMatching(/invalid-credential|wrong-password/),
    });
    expect(auth.currentUser).toBeNull();
    await expect(
      createUserWithEmailAndPassword(auth, email, password),
    ).rejects.toMatchObject({ code: "auth/email-already-in-use" });
    await sendPasswordResetEmail(auth, email);
    const reset = (await codes()).oobCodes.find(
      (c) => c.email === email && c.requestType === "PASSWORD_RESET",
    );
    expect(reset).toBeTruthy();
    expect(await verifyPasswordResetCode(auth, reset!.oobCode)).toBe(email);
    const newPassword = "Reset-local-test-456!";
    await confirmPasswordReset(auth, reset!.oobCode, newPassword);
    await expect(
      signInWithEmailAndPassword(auth, email, password),
    ).rejects.toMatchObject({
      code: expect.stringMatching(/invalid-credential|wrong-password/),
    });
    const signedIn = await signInWithEmailAndPassword(auth, email, newPassword);
    expect(signedIn.user.uid).toBe(uid);
    await signOut(auth);
    const separateSession = await signInWithEmailAndPassword(
      authB,
      email,
      newPassword,
    );
    expect(separateSession.user.uid).toBe(uid);
    await deleteUser(separateSession.user);
  });
});
