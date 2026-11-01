import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { ArrowUpRight, MessageCircle, ShieldCheck, Video } from "lucide-react";
import { auth, configured } from "../firebase";
import { authSchema, loginSchema, friendly } from "../lib";
import { useSession } from "../session";
import { useSettings } from "../store";
export default function Auth() {
  const { mode } = useParams();
  const registerMode = mode === "register",
    reset = mode === "forgot";
  const { user } = useSession();
  const nav = useNavigate();
  const submitting = useRef(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors },
    clearErrors,
  } = useForm({
    resolver: zodResolver(registerMode ? authSchema : loginSchema),
  });
  useEffect(() => {
    setError("");
    setSuccess("");
    clearErrors();
  }, [mode, clearErrors]);
  async function submit(data: { email: string; password: string }) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (registerMode) {
        const result = await createUserWithEmailAndPassword(
          auth,
          data.email,
          data.password,
        );
        try {
          await sendEmailVerification(result.user);
        } catch (e) {
          useSettings
            .getState()
            .notify(
              `Your account was created. We couldn’t send verification: ${friendly(e)} You can resend it in Settings.`,
            );
        }
      } else await signInWithEmailAndPassword(auth, data.email, data.password);
      nav("/", { replace: true });
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  return (
    <main className="welcome">
      <section className="welcome-story">
        <Link className="brand" to="/">
          gather<span>✳</span>
        </Link>
        <span className="eyebrow">GOOD CONVERSATIONS LIVE HERE</span>
        <h1>
          A little closer.
          <br />
          <i>Wherever you are.</i>
        </h1>
        <p>
          Your people. Your conversations. A thoughtful space to stay connected,
          from the everyday hello to the big life updates.
        </p>
        <div className="illustration">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="note note-one">
            A familiar voice.<span>Something to look forward to.</span>
          </div>
          <div className="note note-two">
            <span className="dot" /> Make a little time for each other.{" "}
            <span>♡</span>
          </div>
          <div className="flower">✳</div>
        </div>
        <footer>
          <span>
            <MessageCircle size={17} /> Real-time conversations
          </span>
          <span>
            <Video size={17} /> Voice & video
          </span>
          <span>
            <ShieldCheck size={17} /> Private by design
          </span>
        </footer>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <span className="eyebrow">YOUR PEOPLE ARE ONE HELLO AWAY</span>
          <h2>
            {!configured
              ? "Make yourself at home."
              : reset
                ? "Let’s get you back in."
                : registerMode
                  ? "Find your people."
                  : "Welcome back."}
          </h2>
          <p className="muted">
            {!configured
              ? "Your Gather workspace is ready for its Firebase connection."
              : reset
                ? "We’ll send a password reset link to your inbox."
                : registerMode
                  ? "A new place for your everyday conversations."
                  : "Pick up right where you left off."}
          </p>
          {!configured ? (
            <div className="setup">
              <h3>Connect your Firebase project</h3>
              <ol>
                <li>
                  Copy <code>.env.example</code> to <code>.env.local</code>.
                </li>
                <li>Add your Firebase web app configuration.</li>
                <li>
                  Enable email and Google sign-in, deploy the included database
                  rules, then restart Vite.
                </li>
              </ol>
              <p>
                No billing, storage bucket, or paid API is required. Full
                instructions are in <code>README.md</code>.
              </p>
            </div>
          ) : user ? (
            <>
              <p>You’re already signed in.</p>
              <Link className="primary" to="/">
                Open Gather <ArrowUpRight size={18} />
              </Link>
            </>
          ) : reset ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (submitting.current) return;
                submitting.current = true;
                setBusy(true);
                setError("");
                setSuccess("");
                try {
                  const email = new FormData(e.currentTarget).get(
                    "email",
                  ) as string;
                  const cleanEmail = authSchema.shape.email.parse(email);
                  await sendPasswordResetEmail(auth, cleanEmail);
                  setSuccess(
                    "If this account exists, a reset link is on its way.",
                  );
                } catch (e) {
                  setError(friendly(e));
                } finally {
                  setBusy(false);
                  submitting.current = false;
                }
              }}
            >
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
              <button className="primary" disabled={busy}>
                Send reset link
              </button>
              <Link to="/auth/login">Back to sign in</Link>
            </form>
          ) : (
            <>
              <button
                className="google"
                disabled={busy}
                onClick={async () => {
                  if (submitting.current) return;
                  submitting.current = true;
                  setBusy(true);
                  setError("");
                  try {
                    await signInWithPopup(auth, new GoogleAuthProvider());
                    nav("/", { replace: true });
                  } catch (e) {
                    setError(friendly(e));
                  } finally {
                    setBusy(false);
                    submitting.current = false;
                  }
                }}
              >
                <b>G</b> Continue with Google
              </button>
              <div className="divider">or use your email</div>
              <form onSubmit={handleSubmit(submit)}>
                <label>
                  Email address
                  <input
                    {...register("email")}
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    aria-invalid={Boolean(errors.email)}
                  />
                  {errors.email && (
                    <small className="error">{errors.email.message}</small>
                  )}
                </label>
                <label>
                  Password
                  <input
                    {...register("password")}
                    type="password"
                    placeholder={
                      registerMode ? "At least 8 characters" : "Your password"
                    }
                    autoComplete={
                      registerMode ? "new-password" : "current-password"
                    }
                    aria-invalid={Boolean(errors.password)}
                  />
                  {errors.password && (
                    <small className="error">{errors.password.message}</small>
                  )}
                </label>
                {!registerMode && (
                  <Link className="forgot" to="/auth/forgot">
                    Forgot password?
                  </Link>
                )}
                <button className="primary" disabled={busy}>
                  {busy
                    ? "Just a moment…"
                    : registerMode
                      ? "Create your account"
                      : "Sign in to Gather"}
                  <ArrowUpRight size={18} />
                </button>
              </form>
              <p className="auth-switch">
                {registerMode ? "Already part of Gather?" : "New around here?"}{" "}
                <Link to={registerMode ? "/auth/login" : "/auth/register"}>
                  {registerMode ? "Sign in" : "Create an account"}
                </Link>
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="success">
              {success}
            </p>
          )}
          <p className="auth-foot">A space for real connection. Always.</p>
        </div>
      </section>
    </main>
  );
}
