import { z } from "zod";
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z][a-z0-9_]{2,23}$/,
    "Use 3–24 lowercase letters, numbers or underscores; start with a letter.",
  );
export const authSchema = z.object({
  email: z.string().trim().pipe(z.email("Enter a valid email address.")),
  password: z.string().min(8, "Use at least 8 characters.").max(128),
});
export const loginSchema = authSchema.extend({
  password: z.string().min(1, "Enter your password.").max(128),
});
export const messageSchema = z
  .string()
  .trim()
  .min(1, "Write a message first.")
  .max(4000, "Messages can contain up to 4,000 characters.");
export const directId = (a: string, b: string) => [a, b].sort().join("_");
export const terminal = (s: string) =>
  ["ended", "rejected", "missed", "failed"].includes(s);
export function canTransition(
  from: string,
  to: string,
  role: "caller" | "callee",
) {
  return (
    !terminal(from) &&
    (to === "ended" ||
      to === "failed" ||
      (from === "ringing" &&
        ((to === "missed" && role === "caller") ||
          (to === "rejected" && role === "callee") ||
          (to === "connecting" && role === "callee"))) ||
      (from === "connecting" && to === "connected"))
  );
}
export function friendly(
  error: unknown,
  context: "general" | "profile" = "general",
): string {
  const code = (error as { code?: string })?.code;
  if (
    (code === "permission-denied" || code === "firestore/permission-denied") &&
    context === "profile"
  )
    return "Firebase denied profile access. Publish Gather’s Firestore rules for this project, then retry. Your account is still signed in.";
  const map: Record<string, string> = {
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/email-already-in-use": "This email already has an account.",
    "auth/popup-closed-by-user": "Sign-in was closed. Please try again.",
    "auth/popup-blocked":
      "Your browser blocked the sign-in window. Allow popups for Gather and try again.",
    "auth/unauthorized-domain":
      "This address is not authorized for Google sign-in. Open Gather on localhost or add this hostname to Firebase Authentication’s authorized domains.",
    "auth/operation-not-allowed":
      "This sign-in method is not enabled in Firebase Authentication. Enable it in the Firebase console.",
    "auth/network-request-failed":
      "Could not reach Firebase. Check your connection and try again.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password":
      "Choose a stronger password with at least 8 characters.",
    "auth/wrong-password": "The email or password is incorrect.",
    "auth/user-not-found": "The email or password is incorrect.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment.",
    "auth/requires-recent-login":
      "For your security, sign out and sign in again before deleting your account.",
    "permission-denied":
      "This action was denied. Check your permissions and the deployed Firebase rules.",
    unavailable: "Connection unavailable. Please reconnect and retry.",
  };
  return (
    (code && map[code]) ||
    (error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.")
  );
}
export function safeUrl(text: string) {
  try {
    const u = new URL(text);
    return ["http:", "https:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
