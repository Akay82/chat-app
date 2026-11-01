import { Component, type ErrorInfo, type ReactNode } from "react";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Gather rendering failed", error, info.componentStack);
  }
  render() {
    return this.state.failed ? (
      <main className="loading">
        <span className="brand">gather ✳</span>
        <h1>Let’s try that again.</h1>
        <p>Gather couldn’t open this view. Reload to reconnect.</p>
        <button className="primary" onClick={() => window.location.reload()}>
          Reload Gather
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
