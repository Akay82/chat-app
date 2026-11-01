export type MediaIssue = { title: string; message: string; steps: string[] };
export class CallMediaError extends Error {
  constructor(public issue: MediaIssue) {
    super(issue.message);
    this.name = "CallMediaError";
  }
}
export function explainMediaError(
  error: unknown,
  kind: "voice" | "video",
): MediaIssue {
  const name = (error as { name?: string })?.name;
  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "SecurityError"
  )
    return {
      title: "Allow microphone access",
      message: `Your browser or Windows blocked access to the microphone${kind === "video" ? " or camera" : ""}.`,
      steps: [
        "Open this address in Chrome, Edge or Brave if you are using an in-app preview.",
        "Use the site controls beside the address bar to allow microphone and camera access.",
        "In Windows Settings → Privacy & security, check Microphone and Camera access for desktop apps, then retry.",
      ],
    };
  if (
    name === "NotReadableError" ||
    name === "TrackStartError" ||
    name === "AbortError"
  )
    return {
      title: "Your device is unavailable",
      message:
        "The microphone or camera could not be started. It may be in use by another app or have a driver problem.",
      steps: [
        "Close other apps using your microphone or camera.",
        "Reconnect your headset or webcam and check Windows input settings.",
        "Return to the chat and retry the call.",
      ],
    };
  return {
    title: "No call device found",
    message:
      kind === "voice"
        ? "This browser could not find an available microphone. Speakers or a monitor audio output cannot capture your voice."
        : "This browser could not find the microphone and camera needed for a video call.",
    steps: [
      "Connect a headset with a microphone, a USB microphone or a webcam.",
      "Check Windows Settings → System → Sound → Input and select a working microphone.",
      kind === "video"
        ? "If you have a microphone but no camera, use the voice-call button instead."
        : "Check that the microphone is enabled and available to your browser.",
      "If you are using the in-app preview, try the same address in Chrome, Edge or Brave.",
    ],
  };
}
export async function acquireCallMedia(
  kind: "voice" | "video",
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new CallMediaError({
      title: "Calling is unavailable here",
      message:
        "Calling needs a secure browser context with microphone support.",
      steps: [
        "Open Gather in a current Chrome, Edge or Brave browser.",
        "Use HTTPS on a deployed site, or localhost on this computer.",
      ],
    });
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === "video" ? { facingMode: "user" } : false,
    });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (
      [
        "NotFoundError",
        "DevicesNotFoundError",
        "OverconstrainedError",
        "NotAllowedError",
        "PermissionDeniedError",
        "SecurityError",
        "NotReadableError",
        "TrackStartError",
        "AbortError",
      ].includes(name || "")
    )
      throw new CallMediaError(explainMediaError(error, kind));
    throw error;
  }
}
