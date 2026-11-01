import React, { Suspense, lazy, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSettings } from "./store";
import { SessionProvider, useSession } from "./session";
import { Pwa } from "./pwa";
import "./style.css";
import { ErrorBoundary } from "./ErrorBoundary";
import { logout } from "./api";
import { friendly } from "./lib";
const Auth = lazy(() => import("./pages/Auth"));
const Workspace = lazy(() => import("./pages/Workspace"));
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 60000, retry: 1 } },
});
function App() {
  const { user, loading, profileError, retryProfile } = useSession();
  const { theme, toast } = useSettings();
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      (document.documentElement.dataset.theme =
        theme === "system" ? (mq.matches ? "dark" : "light") : theme);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [theme]);
  return (
    <>
      <Suspense
        fallback={
          <div className="loading">
            <span className="brand">
              gather<span>✳</span>
            </span>
            <p>Making room for you…</p>
            <div className="skeleton" />
          </div>
        }
      >
        {loading ? (
          <div className="loading">Connecting securely…</div>
        ) : profileError && user ? (
          <main className="loading">
            <span className="brand">gather ✳</span>
            <h1>Let’s reconnect your profile.</h1>
            <p>
              Your account is signed in, but Gather couldn’t load its profile.
            </p>
            <p role="alert" className="error">
              {profileError}
            </p>
            <button className="primary" onClick={retryProfile}>
              Retry profile
            </button>
            <button
              className="secondary"
              onClick={() =>
                void logout().catch((e) =>
                  useSettings.getState().notify(friendly(e)),
                )
              }
            >
              Sign out
            </button>
          </main>
        ) : (
          <Routes>
            <Route path="/" element={user ? <Workspace /> : <Auth />} />
            <Route
              path="/chat/:chatId"
              element={user ? <Workspace /> : <Auth />}
            />
            <Route path="/auth/:mode" element={<Auth />} />
            <Route
              path="*"
              element={
                <div className="loading">
                  <h1>A little off the path.</h1>
                  <Link to="/">Back to Gather</Link>
                </div>
              }
            />
          </Routes>
        )}
      </Suspense>
      <Pwa />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
const root =
  import.meta.hot?.data.root || createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <SessionProvider>
            <App />
          </SessionProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
