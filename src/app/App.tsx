import { useCallback, useEffect, useState } from "react";
import { readAutosave } from "../file/autosave";
import { useDocStore } from "../model/store";
import { loadStencilsForDoc } from "../share/documentStencils";
import { ShareErrorCard, ShareLoading, ViewerShell } from "../share/ViewerShell";
import { decodeFragmentToDoc, isShareFragment, readSharePath } from "../share/urlCodec";
import { AppShell } from "./AppShell";

type Phase =
  /** No share link in the URL: the ordinary editor, exactly as before this existed. */
  | { kind: "editor" }
  | { kind: "loading" }
  | { kind: "viewing" }
  | { kind: "error"; message: string }
  /** Came in through a share link and chose "Edit a copy". */
  | { kind: "editing-copy" };

/**
 * Removes the payload from the address bar once the document has been taken into the editor, so
 * a reload doesn't drop the user back into the read-only viewer holding a stale copy of what
 * they have since been editing.
 */
function clearShareFragment(): void {
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

/**
 * Decides what the app is on this page load: the editor, or someone's shared diagram.
 *
 * The decision is made here, above AppShell, because it has to be made *before* any of the
 * editor's own boot behaviour runs. AppShell mounts autosave, the "unsaved diagram found —
 * restore?" prompt and the first-visit sample; all three would fire on a share link and one of
 * them would overwrite the recipient's work with a stranger's diagram. Not mounting AppShell at
 * all is a guarantee, where a flag inside each of those hooks would only have been a promise.
 */
export function App() {
  // Read synchronously from the initial URL so the editor never flashes on screen before the
  // viewer takes over — and, more importantly, never mounts and autosaves in that instant.
  const [phase, setPhase] = useState<Phase>(() =>
    isShareFragment(window.location.hash) ? { kind: "loading" } : { kind: "editor" },
  );

  useEffect(() => {
    if (phase.kind !== "loading") return;
    let cancelled = false;
    void (async () => {
      const result = await decodeFragmentToDoc(window.location.hash);
      if (cancelled) return;
      if (result.ok) {
        // Before the canvas appears, not after: the stencil cache is normally filled by the
        // shape library, which the viewer doesn't mount, and shapes drawn against an empty
        // cache come out as bare labels with no geometry.
        await loadStencilsForDoc(result.doc);
        if (cancelled) return;
        useDocStore.getState().enterViewerMode(result.doc);
        // "Open at this level": land the reader on the box the sharer had open. Deliberately
        // after enterViewerMode, which resets navigation to page one, and deliberately
        // tolerant — navigateToDiagram no-ops on an id this document doesn't contain, which is
        // the right outcome for a hand-edited or stale link. Better page one than an error.
        const openAt = readSharePath(window.location.hash);
        if (openAt) useDocStore.getState().navigateToDiagram(openAt);
        setPhase({ kind: "viewing" });
      } else {
        setPhase({ kind: "error", message: result.error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase.kind]);

  const editCopy = useCallback(() => {
    // Only now is the recipient's own work at risk, which is why the confirm lives here and not
    // at load time. Wording and mechanism match New diagram (app/fileActions.ts) — the same
    // "you're about to lose what you had" moment.
    if (
      readAutosave() !== null &&
      !window.confirm("Edit a copy of this shared diagram? Unsaved changes in your own diagram will be lost.")
    ) {
      return;
    }
    clearShareFragment();
    useDocStore.getState().exitViewerMode();
    setPhase({ kind: "editing-copy" });
  }, []);

  const startFresh = useCallback(() => {
    clearShareFragment();
    setPhase({ kind: "editor" });
  }, []);

  switch (phase.kind) {
    case "loading":
      return <ShareLoading />;
    case "viewing":
      return <ViewerShell onEditCopy={editCopy} />;
    case "error":
      return <ShareErrorCard message={phase.message} onStartFresh={startFresh} />;
    case "editing-copy":
      // The document in the store is the shared one. Restoring the recipient's autosave over it
      // or dropping the first-visit sample on top would both undo the choice they just made.
      return <AppShell fromShareLink />;
    default:
      return <AppShell />;
  }
}
