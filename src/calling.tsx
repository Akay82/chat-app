import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  RefreshCw,
} from "lucide-react";
import { auth, db, iceServers } from "./firebase";
import { useSession } from "./session";
import { useSettings } from "./store";
import { friendly, terminal } from "./lib";
import type { Call } from "./types";
import { Modal } from "./components";
import { useQuery } from "@tanstack/react-query";
import { getProfile } from "./api";
import { acquireCallMedia, CallMediaError, type MediaIssue } from "./media";
import {
  showBrowserNotification,
  dismissBrowserNotifications,
  playAttentionSound,
} from "./notifications";
export function useCalls() {
  const { user } = useSession();
  const [history, setHistory] = useState<Call[]>([]),
    [active, setActive] = useState<Call | null>(null),
    [incoming, setIncoming] = useState<Call | null>(null),
    [local, setLocal] = useState<MediaStream | null>(null),
    [remote, setRemote] = useState<MediaStream | null>(null),
    [status, setStatus] = useState(""),
    [started, setStarted] = useState(0);
  const [mediaIssue, setMediaIssue] = useState<MediaIssue | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null),
    stream = useRef<MediaStream | null>(null),
    current = useRef<Call | null>(null),
    busy = useRef(false),
    mounted = useRef(true),
    attempt = useRef(0),
    off = useRef<(() => void)[]>([]),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clean() {
    attempt.current++;
    if (timer.current) clearTimeout(timer.current);
    off.current.forEach((f) => f());
    off.current = [];
    pc.current?.close();
    pc.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setLocal(null);
    setRemote(null);
    setActive(null);
    current.current = null;
    busy.current = false;
    setStarted(0);
  }
  async function purge(id: string) {
    try {
      await updateDoc(doc(db, "calls", id), {
        offer: { type: "offer", sdp: "" },
        answer: null,
        updatedAt: serverTimestamp(),
      });
      const docs = await getDocs(
        query(collection(db, "calls", id, "candidates"), limit(450)),
      );
      const batch = writeBatch(db);
      docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    } catch {
      /* best effort, documented retention */
    }
  }
  async function finish(state: Call["state"] = "ended") {
    const c = current.current;
    clean();
    if (c) {
      try {
        await updateDoc(doc(db, "calls", c.id), {
          state,
          updatedAt: serverTimestamp(),
        });
        await purge(c.id);
      } catch (e) {
        useSettings.getState().notify(friendly(e));
      }
    }
  }
  useEffect(() => {
    if (!user) return;
    let first = true;
    return onSnapshot(
      query(
        collection(db, "calls"),
        where("participants", "array-contains", user.uid),
        orderBy("createdAt", "desc"),
        limit(30),
      ),
      (snap) => {
        const records = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Call,
        );
        setHistory(records);
        const ring = records.find(
          (c) =>
            c.callee === user.uid &&
            c.state === "ringing" &&
            c.expiresAt.toMillis() > Date.now(),
        );
        if (ring && busy.current && current.current?.id !== ring.id) {
          void updateDoc(doc(db, "calls", ring.id), {
            state: "rejected",
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        } else setIncoming(ring || null);
        if (first) {
          first = false;
          records
            .filter(
              (c) =>
                !terminal(c.state) &&
                c.id !== current.current?.id &&
                (c.caller === user.uid || c.state !== "ringing"),
            )
            .forEach((c) => {
              void updateDoc(doc(db, "calls", c.id), {
                state: "failed",
                updatedAt: serverTimestamp(),
              }).catch(() => {});
            });
        }
      },
      (e) => {
        if (auth.currentUser?.uid === user.uid)
          useSettings.getState().notify(friendly(e));
      },
    );
  }, [user]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      attempt.current++;
      off.current.forEach((f) => f());
      pc.current?.close();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (!incoming) return;
    const id = setTimeout(
      () => setIncoming(null),
      Math.max(0, incoming.expiresAt.toMillis() - Date.now()),
    );
    return () => clearTimeout(id);
  }, [incoming]);
  useEffect(() => {
    if (!incoming) return;
    const tag = `gather-call-${incoming.id}`;
    if (document.hidden || !document.hasFocus())
      void showBrowserNotification(
        `Gather · Incoming ${incoming.kind} call`,
        "Open Gather to answer.",
        `/chat/${incoming.chatId}`,
        tag,
      );
    playAttentionSound(true);
    const ring = setInterval(() => playAttentionSound(true), 2500);
    return () => {
      clearInterval(ring);
      void dismissBrowserNotifications(tag);
    };
    // Only restart the alert when the incoming call changes.
  }, [incoming?.id]);
  async function setup(kind: Call["kind"]) {
    const media = await acquireCallMedia(kind);
    if (!mounted.current) {
      media.getTracks().forEach((t) => t.stop());
      throw Error("Call cancelled.");
    }
    stream.current = media;
    setLocal(media);
    const connection = new RTCPeerConnection({ iceServers: iceServers() });
    pc.current = connection;
    media.getTracks().forEach((t) => connection.addTrack(t, media));
    const other = new MediaStream();
    setRemote(other);
    connection.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach((t) => {
        if (!other.getTracks().some((x) => x.id === t.id)) other.addTrack(t);
      });
    };
    connection.onconnectionstatechange = () => {
      setStatus(connection.connectionState);
      if (connection.connectionState === "connected") {
        setStarted(Date.now());
        const c = current.current;
        if (c)
          void updateDoc(doc(db, "calls", c.id), {
            state: "connected",
            updatedAt: serverTimestamp(),
          }).catch(() => {});
      }
      if (connection.connectionState === "failed") void finish("failed");
      if (connection.connectionState === "disconnected") {
        timer.current = setTimeout(() => void finish("failed"), 15000);
      } else if (connection.connectionState === "connected" && timer.current)
        clearTimeout(timer.current);
    };
    return connection;
  }
  function signal(c: Call) {
    current.current = c;
    setActive(c);
    const connection = pc.current!;
    const pending: RTCIceCandidateInit[] = [];
    const localCandidates: RTCIceCandidateInit[] = [];
    let ready = false;
    connection.onsignalingstatechange = () => {
      if (connection.remoteDescription)
        for (const candidate of pending.splice(0))
          void connection.addIceCandidate(candidate).catch(() => {});
    };
    const publish = (candidate: RTCIceCandidateInit) => {
      void addDoc(collection(db, "calls", c.id, "candidates"), {
        owner: user!.uid,
        candidate,
      }).catch((e) => useSettings.getState().notify(friendly(e)));
    };
    connection.onicecandidate = (e) => {
      if (e.candidate) {
        const candidate = e.candidate.toJSON();
        if (ready) publish(candidate);
        else localCandidates.push(candidate);
      }
    };
    const flush = () => {
      ready = true;
      localCandidates.splice(0).forEach(publish);
    };
    off.current.push(
      onSnapshot(doc(db, "calls", c.id), async (snap) => {
        const data = { id: snap.id, ...snap.data() } as Call;
        current.current = data;
        setActive(data);
        flush();
        if (terminal(data.state)) {
          clean();
          void purge(c.id);
          useSettings.getState().notify(`Call ${data.state}.`);
          return;
        }
        if (
          data.state === "connecting" &&
          connection.connectionState !== "connected"
        ) {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void finish("failed"), 40000);
        }
        try {
          if (
            data.answer &&
            c.caller === user!.uid &&
            !connection.remoteDescription
          ) {
            await connection.setRemoteDescription(data.answer);
            for (const candidate of pending.splice(0))
              await connection.addIceCandidate(candidate);
          }
        } catch (e) {
          useSettings.getState().notify(friendly(e));
          void finish("failed");
        }
      }),
    );
    off.current.push(
      onSnapshot(collection(db, "calls", c.id, "candidates"), (snap) => {
        snap
          .docChanges()
          .filter((d) => d.type === "added")
          .forEach((d) => {
            if (d.doc.data().owner === user!.uid) return;
            const candidate = d.doc.data().candidate as RTCIceCandidateInit;
            if (connection.remoteDescription)
              void connection.addIceCandidate(candidate).catch(() => {});
            else pending.push(candidate);
          });
      }),
    );
    return flush;
  }
  async function start(chatId: string, callee: string, kind: Call["kind"]) {
    if (busy.current) throw Error("Finish your current call first.");
    if (!navigator.onLine) throw Error("Reconnect before starting a call.");
    busy.current = true;
    setMediaIssue(null);
    const generation = attempt.current;
    setStatus("Requesting media permission");
    try {
      const connection = await setup(kind);
      const ref = doc(collection(db, "calls"));
      const offer = await connection.createOffer();
      const created = Timestamp.now();
      const c: Call = {
        id: ref.id,
        chatId,
        caller: user!.uid,
        callee,
        participants: [user!.uid, callee],
        kind,
        state: "ringing",
        offer: { type: "offer", sdp: offer.sdp },
        answer: null,
        createdAt: created,
        updatedAt: created,
        expiresAt: Timestamp.fromMillis(Date.now() + 60000),
      };
      // Attach ICE handler before setting local description. Firestore write precedes candidate publishing.
      current.current = c;
      setActive(c);
      const candidates: RTCIceCandidateInit[] = [];
      connection.onicecandidate = (e) => {
        if (e.candidate) candidates.push(e.candidate.toJSON());
      };
      await connection.setLocalDescription(offer);
      const { id: _id, ...data } = c;
      await setDoc(ref, {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (generation !== attempt.current || !mounted.current) {
        await updateDoc(ref, { state: "failed", updatedAt: serverTimestamp() });
        await purge(c.id);
        return;
      }
      signal(c)();
      for (const candidate of candidates)
        await addDoc(collection(ref, "candidates"), {
          owner: user!.uid,
          candidate,
        });
      setStatus("Ringing");
      timer.current = setTimeout(() => {
        if (current.current?.state === "ringing") void finish("missed");
      }, 61000);
    } catch (e) {
      clean();
      if (e instanceof CallMediaError) setMediaIssue(e.issue);
      throw e;
    }
  }
  async function accept() {
    if (!incoming || busy.current) return;
    busy.current = true;
    const c = incoming;
    current.current = c;
    setMediaIssue(null);
    setIncoming(null);
    try {
      const connection = await setup(c.kind);
      current.current = c;
      const flush = signal(c);
      await connection.setRemoteDescription(c.offer);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await updateDoc(doc(db, "calls", c.id), {
        answer: { type: "answer", sdp: answer.sdp },
        state: "connecting",
        updatedAt: serverTimestamp(),
      });
      flush();
      setStatus("Connecting");
      timer.current = setTimeout(() => {
        if (pc.current?.connectionState !== "connected") void finish("failed");
      }, 40000);
    } catch (e) {
      if (e instanceof CallMediaError) setMediaIssue(e.issue);
      useSettings.getState().notify(friendly(e));
      await finish("failed");
    }
  }
  async function reject() {
    if (incoming) {
      try {
        await updateDoc(doc(db, "calls", incoming.id), {
          state: "rejected",
          updatedAt: serverTimestamp(),
        });
        setIncoming(null);
        await purge(incoming.id);
      } catch (error) {
        useSettings.getState().notify(friendly(error));
      }
    }
  }
  async function switchCamera() {
    if (!pc.current || !stream.current) return;
    const old = stream.current.getVideoTracks()[0];
    if (!old) return;
    const facing =
      old.getSettings().facingMode === "environment" ? "user" : "environment";
    const next = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing } },
    });
    if (!pc.current || !stream.current || !mounted.current) {
      next.getTracks().forEach((t) => t.stop());
      return;
    }
    const track = next.getVideoTracks()[0];
    const sender = pc.current
      .getSenders()
      .find((s) => s.track?.kind === "video");
    try {
      await sender?.replaceTrack(track);
    } catch (e) {
      next.getTracks().forEach((t) => t.stop());
      throw e;
    }
    old.stop();
    stream.current.removeTrack(old);
    stream.current.addTrack(track);
    setLocal(new MediaStream(stream.current.getTracks()));
  }
  return {
    history,
    active,
    incoming,
    local,
    remote,
    status,
    started,
    start,
    accept,
    reject,
    finish,
    switchCamera,
    mediaIssue,
    clearMediaIssue: () => setMediaIssue(null),
  };
}
export type CallController = ReturnType<typeof useCalls>;
export function CallOverlay({ calls }: { calls: CallController }) {
  const { active, incoming } = calls;
  const { user } = useSession();
  const other = (active || incoming)?.participants.find(
    (uid) => uid !== user?.uid,
  );
  const { data: person } = useQuery({
    queryKey: ["profile", other],
    queryFn: () => getProfile(other!),
    enabled: Boolean(other),
  });
  const [seconds, setSeconds] = useState(0),
    [muted, setMuted] = useState(false),
    [camera, setCamera] = useState(true);
  const localRef = useRef<HTMLVideoElement>(null),
    remoteRef = useRef<HTMLVideoElement>(null),
    audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = calls.local;
    if (remoteRef.current) remoteRef.current.srcObject = calls.remote;
    if (audioRef.current) audioRef.current.srcObject = calls.remote;
  }, [calls.local, calls.remote, active]);
  useEffect(() => {
    const id = setInterval(
      () =>
        setSeconds(
          calls.started ? Math.floor((Date.now() - calls.started) / 1000) : 0,
        ),
      1000,
    );
    return () => clearInterval(id);
  }, [calls.started]);
  if (!active && !incoming && calls.mediaIssue)
    return (
      <Modal title={calls.mediaIssue.title} close={calls.clearMediaIssue}>
        <p>{calls.mediaIssue.message}</p>
        <ol className="device-help">
          {calls.mediaIssue.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="muted">
          No microphone or camera stream is recorded or stored by Gather.
        </p>
        <button className="primary" onClick={calls.clearMediaIssue}>
          Back to chat
        </button>
      </Modal>
    );
  if (!active && !incoming) return null;
  return (
    <Modal
      title={
        incoming
          ? `Incoming ${incoming.kind} call`
          : `${active!.kind === "video" ? "Video" : "Voice"} call`
      }
      close={() => {
        if (incoming) void calls.reject();
        else void calls.finish();
      }}
    >
      <div className="call-screen">
        {active?.kind === "video" ? (
          <div className="video-stage">
            <video ref={remoteRef} autoPlay playsInline />
            <video
              className="local-video"
              ref={localRef}
              autoPlay
              playsInline
              muted
            />
          </div>
        ) : (
          <div className="call-orb">
            <Phone size={38} />
          </div>
        )}
        {active?.kind !== "video" && <audio ref={audioRef} autoPlay />}
        <h3>
          {incoming
            ? `${person?.displayName || "Someone"} is calling.`
            : person?.displayName || "Your conversation"}
        </h3>
        {active && (
          <p className="muted" role="status">
            {calls.status}
          </p>
        )}
        <p className="muted">
          {incoming
            ? "Accept to share your microphone" +
              (incoming.kind === "video" ? " and camera." : ".")
            : calls.started
              ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
              : "Waiting for a connection…"}
        </p>
        <div className="call-controls">
          {incoming ? (
            <>
              <button className="danger" onClick={() => void calls.reject()}>
                <PhoneOff /> Decline
              </button>
              <button className="primary" onClick={() => void calls.accept()}>
                <Phone /> Accept
              </button>
            </>
          ) : (
            <>
              <button
                className="icon"
                aria-label={muted ? "Unmute microphone" : "Mute microphone"}
                onClick={() => {
                  calls.local
                    ?.getAudioTracks()
                    .forEach((t) => (t.enabled = muted));
                  setMuted(!muted);
                }}
              >
                {muted ? <MicOff /> : <Mic />}
              </button>
              {active?.kind === "video" && (
                <>
                  <button
                    className="icon"
                    aria-label="Toggle camera"
                    onClick={() => {
                      calls.local
                        ?.getVideoTracks()
                        .forEach((t) => (t.enabled = !camera));
                      setCamera(!camera);
                    }}
                  >
                    {camera ? <Video /> : <VideoOff />}
                  </button>
                  <button
                    className="icon"
                    aria-label="Switch camera"
                    onClick={() =>
                      void calls
                        .switchCamera()
                        .catch((e) =>
                          useSettings.getState().notify(friendly(e)),
                        )
                    }
                  >
                    <RefreshCw />
                  </button>
                </>
              )}
              <button className="danger" onClick={() => void calls.finish()}>
                <PhoneOff /> End call
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
