// Keeps one broken part of the screen from taking the rest of the app down with it.
//
// Without a boundary, React unmounts the whole tree when any component throws while rendering.
// That happened while building D80: the status bar threw, and the entire shell went — the canvas,
// the menus, and the autosave hook that lives in AppShell — with nothing on screen to say so. In
// a release build the same class of bug would silently stop autosave. So each region of the shell
// sits in its own boundary: a region that fails shows a small notice with
// a way to retry, and everything else, autosave included, keeps working.
//
// A class component because React offers error boundaries no other way.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { saveDocument } from "../file/saveDocument";
import { useDocStore } from "../model/store";
import styles from "./ErrorBoundary.module.css";

interface Props {
  /** What this boundary wraps, for the notice and the console ("the format panel"). */
  area: string;
  children: ReactNode;
  /**
   * The last-resort boundary around the whole app: when it fails, there is no app left to keep
   * working, so its notice offers the diagram itself as a file instead of a retry alone.
   */
  whole?: boolean;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`${this.props.area} stopped working:`, error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    if (this.props.whole) {
      return (
        <div className={styles.whole} role="alert" data-testid="nd-crash-whole">
          <h1 className={styles.title}>Something went wrong</h1>
          <p>The app hit a problem it couldn&apos;t recover from. Your diagram is still in memory — save a copy before reloading.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => saveDocument(useDocStore.getState().doc)}>
              Save a copy of the diagram
            </button>
            <button type="button" className={styles.secondary} onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
          <pre className={styles.detail}>{this.state.error.message}</pre>
        </div>
      );
    }

    return (
      <div className={styles.region} role="alert" data-testid="nd-crash-region">
        <span>
          {capitalise(this.props.area)} hit a problem. The rest of the app, and autosave, are still working.
        </span>
        <button type="button" className={styles.secondary} onClick={this.retry}>
          Try again
        </button>
      </div>
    );
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
