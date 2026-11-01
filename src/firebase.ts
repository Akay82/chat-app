import { initializeApp, getApps } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  memoryLocalCache,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";
const e = import.meta.env;
export const configured = Boolean(
  e.VITE_FIREBASE_API_KEY &&
  e.VITE_FIREBASE_PROJECT_ID &&
  e.VITE_FIREBASE_APP_ID,
);
const existing = getApps().find((app) => app.name === "[DEFAULT]");
const app =
  existing ||
  initializeApp({
    apiKey: e.VITE_FIREBASE_API_KEY || "not-configured",
    authDomain: e.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: e.VITE_FIREBASE_PROJECT_ID || "demo-gather",
    appId: e.VITE_FIREBASE_APP_ID || "unconfigured",
    databaseURL:
      e.VITE_FIREBASE_DATABASE_URL ||
      "https://demo-gather-default-rtdb.firebaseio.com",
  });
export const auth = getAuth(app);
export const db = existing
  ? getFirestore(app)
  : initializeFirestore(app, { localCache: memoryLocalCache() });
export const rtdb = getDatabase(app);
if (e.VITE_USE_EMULATORS === "true" && !existing) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8188);
  connectDatabaseEmulator(rtdb, "127.0.0.1", 9000);
}
export function iceServers(): RTCIceServer[] {
  try {
    const servers: unknown = JSON.parse(e.VITE_ICE_SERVERS || "[]");
    if (
      !Array.isArray(servers) ||
      servers.some((s) => !s || typeof s !== "object" || !("urls" in s))
    )
      throw Error();
    return servers as RTCIceServer[];
  } catch {
    throw new Error(
      "VITE_ICE_SERVERS must be a JSON array of ICE server objects.",
    );
  }
}
