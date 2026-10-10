// First, before anything that reads storage at load: the rename's migration and the alias-host
// redirect (D100).
import { ORIGIN_DECISION } from "./app/startup";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { MovedNotice } from "./app/MovedNotice";
import { dismissSplash, startSplash } from "./app/splash";
import { useDocStore } from "./model/store";

// IBM Plex, self-hosted via @fontsource — deliberately not the Google Fonts CDN. The app makes
// a local-only promise (see app/LocalOnlyBadge.tsx) and must work with no network at all, so a
// third-party request for a font would break both. @fontsource ships the woff2 files inside the
// package and references them relatively, so Vite bundles them with everything else.
//
// Only the weights actually used, latin subset only: every extra file is bytes a first-time
// visitor waits for. Italic is not imported — the browser synthesises it for the rare italic
// label, which is a fair trade against doubling the payload of every weight.
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./styles/global.css";

if (import.meta.env.DEV) {
  // Dev-only console/debugging hook — never included in production builds.
  (window as unknown as { __ddStore: typeof useDocStore }).__ddStore = useDocStore;
}

// The startup screen is already on the page (index.html, N3); from here on it is only timing.
// The moved notice is a question for the user, so nothing may sit over it.
startSplash();
if (ORIGIN_DECISION.kind === "notice") dismissSplash();

// A redirect is already under way: drawing the app would only flash it.
if (ORIGIN_DECISION.kind !== "redirect") {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      {/* Last resort: if the whole app fails, still hand the user their diagram (D81). */}
      <ErrorBoundary area="the app" whole>
        <App />
      </ErrorBoundary>
      {ORIGIN_DECISION.kind === "notice" && <MovedNotice to={ORIGIN_DECISION.to} />}
    </StrictMode>,
  );
}
