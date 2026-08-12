import { Component, type ErrorInfo, type ReactNode } from "react";
import { OrbitMark } from "./Logo";
import { logError } from "../lib/telemetry";
import "./ErrorBoundary.css";

interface Props {
  children: ReactNode;
  /** Names the region for the error report, e.g. "app" or "calendar". */
  context?: string;
}

interface State {
  error: Error | null;
}

/**
 * Without this, any error thrown during render unmounts the whole React tree
 * and the user is left staring at a blank white page with no explanation.
 * Error boundaries have to be class components — there's no hook equivalent.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(error, {
      context: this.props.context ?? "ErrorBoundary",
      fatal: true,
      componentStack: info.componentStack ?? undefined,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="crash-screen">
        <OrbitMark size={64} />
        <h1>Something went wrong</h1>
        <p>
          The error has been logged. Reloading usually fixes it — your data is
          safe, nothing was lost.
        </p>

        <div className="crash-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload the page
          </button>
          <a className="btn btn-ghost" href="/dashboard">
            Back to dashboard
          </a>
        </div>

        {/* Kept collapsed: useful when a user reports a problem, invisible
            otherwise so it doesn't read as alarming. */}
        <details className="crash-details">
          <summary>Technical details</summary>
          <pre>{this.state.error.message}</pre>
        </details>
      </div>
    );
  }
}
