// Document store: one Zustand store per open
// document, all mutations go through named actions (command pattern), undo/redo is
// document-global. zundo tracks only the `doc` slice — selection/viewport/ui churn never
// enters the undo history.
import { create, useStore } from "zustand";
import { APP_VERSION } from "../app/version";
import { temporal } from "zundo";
import { nanoid } from "nanoid";
import type { DiagramDocument, DEdge, DNode, EdgeLabelPosition, ImageAsset, Layer, NestedNode, NoteFocus, Port, RichLabel, ShapeNode, StyleMap } from "./types";
import type { ImportNotice } from "../file/importNotices";
import * as actions from "./actions";
import { loadLayoutEngine } from "./elkEngine";
import { autoLayout, autoLayoutAllLevels, type LayoutDirection } from "./layout";
import { readLayoutDirection, writeLayoutDirection } from "./layoutDirection";
import * as imageOps from "./assets";
import * as groups from "./groups";
import * as layers from "./layers";
import { createDefaultLayers, getLayers } from "./layers";
import * as nesting from "./nesting";
import * as pages from "./pages";
import { applyTemplate as applyTemplateToDoc, type ApplyMode } from "../templates/applyTemplate";
import { findMatches, replaceOne } from "./findReplace";
import {
  captureScratchpadItem,
  readScratchpad,
  scratchpadItemFromStencil,
  writeScratchpad,
  type ScratchpadItem,
} from "./scratchpad";
import { BRAND } from "../app/brand";
import { readTheme, writeTheme } from "../app/theme";
import { readMotionEnabled, writeMotionEnabled } from "../app/motionPreference";
import { setDiagramDrawIn, setEdgesMotion, setNestedPeek, setNodesMotion, type EdgeMotion, type NodeMotion, type PresentationMode } from "./motion";
import { setPresentationMode, setPresentationOrder } from "./presentation";
import { deletionStakes, liftNestedContents, removeLinksThrough, type BlockStake, type MappedStake } from "./deletion";
import { carryInto, carryOut, type Trace } from "../nesting/trace";
import { readSidebarTab, writeSidebarTab, type SidebarTab } from "../library/sidebarTab";
import {
  readActionsSinceExport,
  readDemoDismissed,
  writeActionsSinceExport,
  writeDemoDismissed,
  writeTourDone,
  writeTourVersion,
} from "../onboarding/onboardingStorage";
import { shouldShowExportReminder } from "../onboarding/exportReminder";
import { CURRENT_FORMAT_VERSION } from "../file/documentFormat";
import { getStencil } from "../library/stencils";
import { newShapeStyle } from "../library/stencils/defaultStyle";
import { hasContent, rememberDocument } from "../file/recentDocs";
import { copyEdges, edgesToCopy, hasFreeEnd, shiftEdge } from "./edgeEnds";
import { addConnectedCopy as addConnectedCopyToDoc, connectNodes, parsePortId, type ConnectArgs, type Side } from "./connectedCopy";
import { GRID_SIZE } from "../canvas/constants";


export interface Selection {
  nodeIds: string[];
  edgeIds: string[];
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

// Onboarding state. Only the flags that must outlive a reload are persisted (to localStorage
// via onboarding/onboardingStorage.ts, not into the document) — `demoActive` is transient by
// design: it describes this session's canvas, not a user preference. Items 3 and 4 of
// The export reminder extends this with actionsSinceExport.
/**
 * The tour's last real step, and the sentinel meaning "over".
 *
 * These are named because the finished value moved: the tour was two steps, so 3 meant
 * finished, and a third step was added. Every "the tour is done" site now says TOUR_FINISHED
 * rather than a literal, so the next step to be added is a one-line change instead of a hunt.
 */
export const TOUR_LAST_STEP = 3;
export const TOUR_FINISHED = TOUR_LAST_STEP + 1;

export interface OnboardingState {
  /** The canvas currently holds the bundled sample rather than the user's own work. */
  demoActive: boolean;
  /** The user has started their own diagram, so the sample must never return. */
  demoDismissed: boolean;
  /** 0 = not started, 1..TOUR_LAST_STEP are the coach-mark steps, TOUR_FINISHED = over. */
  tourStep: number;
  /**
   * This session is showing only the newest step, to someone who completed an earlier version
   * of the tour. The card is prefixed "New:" and there is no step counter, because "3 of 3"
   * would be a lie to someone who is being shown exactly one thing.
   */
  newStepOnly: boolean;
  /**
   * Mutating actions since the last successful export. Persisted, because someone who made
   * 14 changes, reloaded, and made one more is exactly as far from a saved copy as someone
   * who made 15 without stopping.
   */
  actionsSinceExport: number;
  /** Export reminders already shown. Session-only: a fresh tab earns a fresh pair. */
  remindersShown: number;
  /** The export reminder toast is on screen. */
  reminderOpen: boolean;
  /** `Date.now()` of this session's last export, for the cooldown. Session-only. */
  lastExportAt: number | null;
}

/**
 * A short, dismissible message about something that just happened. Deliberately data, not a
 * callback: the store stays serialisable, and the component decides what "download-doc" means
 * rather than the caller having to hand a function across the boundary.
 */
/** What a tidy-up covers: just the selection, the level being viewed, or every level below it. */
export type TidyUpScope = "selection" | "level" | "all-levels";

export interface Notice {
  message: string;
  tone: "info" | "warn";
  /** Shown in a read-only field with a Copy button, for when the clipboard write itself failed. */
  url?: string;
  action?: "download-doc" | "copy-live-link";
}

export interface UiState {
  onboarding: OnboardingState;
  /** Feedback about the last action taken; null when there is nothing to say. */
  notice: Notice | null;
  /**
   * What the last import changed along the way, for ImportNoticesPanel; null when there is nothing
   * to report. Session-only UI state, deliberately outside the document so it is never saved,
   * exported or undone.
   */
  importNotices: ImportNotice[] | null;
  /**
   * The user closed the "Start from a template" panel to draw their own diagram. Session-only, so
   * it never reappears on the next empty page in this visit (D81).
   */
  startPanelDismissed: boolean;
  /** Which half of the left sidebar is showing. Remembered across sessions. */
  sidebarTab: SidebarTab;
  /**
   * A template the user picked that needs a decision before it can be applied, because the
   * page they are on already has content. Null when nothing is pending.
   */
  pendingTemplateId: string | null;
  /** Bumped to ask the Export menu to open; see requestExportMenu. */
  exportMenuRequest: number;
  /** The File menu's export entries are momentarily highlighted. */
  exportHighlight: boolean;
  /**
   * The canvas is showing someone else's shared diagram, opened from a `#d=` link, and must
   * stay read-only. The strong guarantee comes from share/ViewerShell.tsx simply not mounting
   * the editor's chrome at all; this flag is what the pieces that *are* shared with the editor
   * (the canvas, ghost links, the page strip) consult to turn their editing affordances off.
   */
  viewerMode: boolean;
  gridEnabled: boolean;
  /**
   * True while a shape is being dragged, resized or rotated. The context bar hides for the gesture
   * and comes back where the selection ends up (R1, D90). Not part of the document or of undo.
   */
  canvasGesture: boolean;
  /**
   * A layout is running. Session-only: it guards against a second one starting while the engine
   * is still being fetched, and is what the Arrange popover's button reads to say so.
   */
  tidyingUp: boolean;
  /** Which way the last tidy-up ran, remembered per browser; what a tidy-up uses when not told. */
  layoutDirection: LayoutDirection;
  /**
   * The note that is open — the one just added, until something else opens or closes it. Not
   * `selected`: a shape selection and an open note are both live at once and neither is the other.
   *
   * Session only, like the trace. It is never written to the document, never carried in a share
   * link, and never recorded by undo — the history records `doc` alone (see partialize below), so
   * everything in `ui` is outside it by construction.
   */
  openNoteId: string | null;
  /**
   * Which side the card is on. Sticky on purpose: the side-switch rule compares against where the
   * card already was, so that stepping through notes near the middle does not flip it about.
   */
  cardSide: "left" | "right" | null;
  /** The pager's full list of notes is showing. */
  noteListOpen: boolean;
  /**
   * A note was just added and has not been named yet, so the card puts the cursor in its title —
   * the way a new Nested Block opens with its name ready for typing.
   */
  noteAwaitingTitle: boolean;
  /** The canvas chip's Page popover is open — Extras ▸ Diagram Settings opens it (R1, D90). */
  pageSettingsOpen: boolean;
  snapEnabled: boolean;
  shortcutsDialogOpen: boolean;
  /** The command palette (Ctrl+K) is open (R2, D91). */
  paletteOpen: boolean;
  /** The Preferences dialog, from the app menu, is open (R2, D91). */
  preferencesOpen: boolean;
  /** The About dialog, from the app menu or the palette (N4). */
  aboutOpen: boolean;
  /** File > Share is open (share/ShareDialog.tsx). */
  shareDialogOpen: boolean;
  /** File > Export to PowerPoint is open (export/pptx/PptxExportDialog.tsx). */
  pptxDialogOpen: boolean;
  /** The GIF export's size choice is open (G3, D141). */
  gifDialogOpen: boolean;
  layersPanelOpen: boolean;
  minimapOpen: boolean;
  findReplaceOpen: boolean;
  darkMode: boolean;
  /** Whether diagram motion plays here (app/motionPreference.ts, D116); reduced motion overrides it. */
  motionEnabled: boolean;
  /** The level whose lines are drawing themselves in, in the viewer (A5, D121); null otherwise. */
  drawingIn: string | null;
  /** The author is previewing this level's Build or Spotlight in the editor (A6, D123); null otherwise. */
  presentationPreview: string | null;
  /** A deletion waiting on the author's choice (N7, D138); null otherwise. */
  deletePrompt: DeletePrompt | null;
}

/** What a deletion would take with it, held while the author chooses (N7, D138). */
export interface DeletePrompt {
  diagramId: string;
  nodeIds: string[];
  edgeIds: string[];
  /** Nested Blocks with shapes inside: delete everything, or keep the contents on this level. */
  blocks: BlockStake[];
  /** Shapes a parent's links enter through: keep the links waiting, or remove them. */
  mapped: MappedStake[];
}

export type DeleteChoice = "delete-all" | "keep-contents" | "keep-waiting" | "remove-links" | "cancel";

export type { ConnectArgs } from "./connectedCopy";

export interface DocStoreState {
  doc: DiagramDocument;
  /**
   * Bumped by loadDoc. Lets a watcher tell "the user edited the document" apart from "a
   * different document was loaded" — both replace `doc`, only the first is an edit.
   */
  docEpoch: number;
  navStack: string[]; // stack of diagram ids; last entry is the diagram currently rendered
  selection: Selection;
  viewportByDiagramId: Record<string, ViewportState>;
  activeLayerByDiagram: Record<string, string>;
  ui: UiState;
  clipboard: DNode[] | null;
  /** The lines copied with `clipboard` (model/edgeEnds.ts edgesToCopy); pasted re-pointed at the copies. */
  clipboardEdges: DEdge[] | null;
  editingNodeId: string | null;
  editingEdgeId: string | null;
  scratchpad: ScratchpadItem[];

  currentDiagramId: () => string;
  setEditingNodeId: (id: string | null) => void;
  setEditingEdgeId: (id: string | null) => void;
  /** Replaces the whole document (File > Open, File > New, autosave restore). Resets
   * navigation/selection/undo history — the old doc's history is meaningless for a new one. */
  loadDoc: (doc: DiagramDocument) => void;

  /** What the reader is tracing (A2, D117): session state, never saved, never undone. */
  trace: Trace | null;
  /** Traces these shapes on the level being viewed; null stops tracing. */
  setTrace: (focus: string[] | null) => void;
  navigateInto: (nestedNodeId: string) => void;
  navigateBack: () => void;
  navigateToLevel: (index: number) => void;
  navigateToDiagram: (diagramId: string) => void;
  saveViewport: (diagramId: string, viewport: ViewportState) => void;

  addPage: (title?: string) => string;
  renamePage: (pageId: string, title: string) => void;
  removePage: (pageId: string) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;
  switchPage: (pageId: string) => void;

  addNestedNode: (
    position: { x: number; y: number },
    size: { w: number; h: number },
    title?: string,
  ) => { nestedNodeId: string; childDiagramId: string };
  convertSelectionToNested: (title?: string) => { nestedNodeId: string; childDiagramId: string } | null;
  setNestedCollapsed: (nestedNodeId: string, patch: Partial<NestedNode["collapsed"]>) => void;
  renameNestedNode: (nestedNodeId: string, label: RichLabel) => void;
  reconnectEdge: (edgeId: string, end: "source" | "target", nodeId: string, handleId: string) => void;
  mapUnlinkedPort: (portId: string, innerNodeId: string, side?: Port["side"]) => void;
  detachPort: (portId: string) => void;
  addPort: (nestedNodeId: string, port: Omit<Port, "id">) => void;
  updatePort: (nestedNodeId: string, portId: string, patch: Partial<Omit<Port, "id">>) => void;
  removePort: (nestedNodeId: string, portId: string) => void;

  addShapeNode: (shapeRef: string, position: { x: number; y: number }, size: { w: number; h: number }) => string;
  addShapeNodeFromScratchpad: (item: ScratchpadItem, position: { x: number; y: number }) => string;
  /** Places pictures centred on `center` in one undo step, selects them, returns their node ids. */
  insertImages: (assets: ImageAsset[], center: { x: number; y: number }) => string[];
  replaceImage: (nodeId: string, asset: ImageAsset) => void;
  resetImageSize: (nodeId: string) => void;
  addSelectionToScratchpad: () => void;
  addStencilToScratchpad: (shapeRef: string, size: { w: number; h: number }) => void;
  removeScratchpadItem: (itemId: string) => void;
  moveOrResizeNodes: (updates: actions.NodePatch[]) => void;
  setNodeLabel: (nodeId: string, label: RichLabel) => void;
  setNodeStyle: (nodeIds: string[], patch: StyleMap) => void;
  /**
   * A style preset (D99): fill and outline together, one undo step. A null colour is removed
   * rather than set, so the shape takes its default again.
   */
  applyStylePreset: (nodeIds: string[], preset: { fill: string | null; stroke: string | null }) => void;
  setNodeLabelStyle: (nodeIds: string[], patch: Partial<RichLabel>) => void;
  removeSelection: () => void;
  bringToFront: (nodeIds: string[]) => void;
  sendToBack: (nodeIds: string[]) => void;
  moveForward: (nodeIds: string[]) => void;
  moveBackward: (nodeIds: string[]) => void;
  alignSelection: (mode: actions.AlignMode) => void;
  distributeSelection: (axis: actions.DistributeAxis) => void;
  /**
   * Lays the diagram out by itself (model/layout.ts). Asynchronous because the layout engine
   * arrives on first use; whatever it moves, however many levels deep, is one undo entry.
   */
  tidyUp: (args: { direction?: LayoutDirection; scope: TidyUpScope }) => Promise<void>;

  // ---- notes (model/notes.ts). Each is one undo step; a run of keystrokes becomes one step the
  // same way the formatting controls do it, by the editing control wrapping them in an edit
  // session (format-panel/useEditSession.ts), not by anything here.
  /** Adds a note about `focus`, selects it, and returns its id. */
  addNote: (focus: NoteFocus, text: string) => string | null;
  updateNote: (id: string, patch: { title?: string; body?: string }) => void;
  deleteNote: (id: string) => void;
  /** Moves a note within the reading order. */
  reorderNotes: (fromIndex: number, toIndex: number) => void;
  setNoteFocus: (id: string, focus: NoteFocus) => void;
  /** Opens a note: the one the note commands act on. Session state, never saved, never undone. */
  openNote: (id: string) => void;
  /**
   * Closes whichever note is open. The scope lists several events that close one and NT2 adds the
   * rest, so they all come through here rather than each clearing the id for itself.
   */
  closeNote: () => void;
  /** Remembers the side the card took, which the hysteresis needs to decide whether to move it. */
  setCardSide: (side: "left" | "right") => void;
  /** Opens or closes the pager's full list of notes. */
  setNoteListOpen: (open: boolean) => void;
  groupSelection: () => string | null;
  ungroupSelection: () => void;

  connect: (args: ConnectArgs) => string;
  /**
   * The ＋ handle's click (R3, D92): a default-styled copy of a shape or Nested Block on that
   * side, connected to it, selected with its label open for typing. One undo step. Returns the
   * copy's id, or null when there is nothing to copy.
   */
  addConnectedCopy: (nodeId: string, side: Side) => string | null;
  /**
   * A line with free ends, as dropped from the sidebar's Lines section (a free line):
   * either end can then be dragged onto a shape to attach it. Selects it; returns its id.
   */
  addLine: (args: { source: { x: number; y: number }; target: { x: number; y: number }; waypoints?: { x: number; y: number }[]; style: StyleMap }) => string;
  /** A line started from a shape's handle and let go on open canvas: attached at one end, free at the other. */
  connectToPoint: (sourceNodeId: string, sourceHandleId: string, point: { x: number; y: number }) => string;
  /** Pulls one end of an edge off whatever it was attached to and leaves it at `point`. */
  setEdgeEndPoint: (edgeId: string, end: "source" | "target", point: { x: number; y: number }) => void;
  /** Moves free lines (their free ends and bends) by (dx, dy); attached ends stay with their shapes. */
  moveEdges: (edgeIds: string[], dx: number, dy: number) => void;
  updateEdgeWaypoints: (edgeId: string, waypoints: { x: number; y: number }[]) => void;
  setEdgeLabel: (edgeId: string, label: RichLabel) => void;
  /** Moves a line's label along or off it (D97); null puts it back in the middle. One undo step. */
  setEdgeLabelPosition: (edgeIds: string[], position: EdgeLabelPosition | null) => void;
  setEdgeStyle: (edgeIds: string[], patch: StyleMap) => void;
  setEdgeLabelStyle: (edgeIds: string[], patch: Partial<RichLabel>) => void;

  setSelection: (nodeIds: string[], edgeIds?: string[]) => void;
  clearSelection: () => void;
  selectAll: () => void;

  copySelection: () => void;
  cutSelection: () => void;
  duplicateSelection: () => void;
  pasteClipboard: () => void;

  toggleGrid: () => void;
  setCanvasGesture: (active: boolean) => void;
  setPageSettingsOpen: (open: boolean) => void;
  toggleSnap: () => void;
  toggleShortcutsDialog: () => void;
  setPaletteOpen: (open: boolean) => void;
  setPreferencesOpen: (open: boolean) => void;
  setAboutOpen: (open: boolean) => void;
  setDiagramBackground: (color: string | undefined) => void;
  setDiagramPageSize: (size: { w: number; h: number } | undefined) => void;

  currentLayers: () => Layer[];
  activeLayerId: () => string;
  setActiveLayer: (layerId: string) => void;
  addLayer: (name?: string) => string;
  renameLayer: (layerId: string, name: string) => void;
  removeLayer: (layerId: string) => void;
  setLayerVisible: (layerId: string, visible: boolean) => void;
  setLayerLocked: (layerId: string, locked: boolean) => void;
  reorderLayer: (fromIndex: number, toIndex: number) => void;
  moveSelectionToLayer: (layerId: string) => void;
  toggleLayersPanel: () => void;
  toggleMinimap: () => void;
  toggleFindReplace: () => void;
  /** Replaces every current match's label text in one undo entry. Returns how many changed. */
  replaceAllMatches: (query: string, replacement: string, matchCase: boolean) => number;
  toggleDarkMode: () => void;
  setMotionEnabled: (on: boolean) => void;
  /** Draw in on the diagram being viewed (A5, D121). */
  setDrawIn: (on: boolean) => void;
  /** Peek on a Nested Block on the diagram being viewed (A5, D121). */
  setPeek: (nestedNodeId: string, on: boolean) => void;
  /** Draw in is playing on this level, in the viewer (A5, D121); null otherwise. */
  setDrawingIn: (diagramId: string | null) => void;
  /** The presentation mode of the diagram being viewed, or none (A6, D123). */
  setPresentationMode: (mode: PresentationMode | null) => void;
  /** Its order of steps; empty means the reading order (A6, D123). */
  setPresentationOrder: (order: string[]) => void;
  /** Starts or stops previewing Build or Spotlight in the editor (A6, D123). */
  setPresentationPreview: (on: boolean) => void;
  /** Settles a deletion the author was asked about (N7, D138). */
  resolveDeletePrompt: (choice: DeleteChoice) => void;
  /** Sets the lines' motion; null makes them still again (D116). */
  setEdgeMotion: (edgeIds: string[], motion: EdgeMotion | null) => void;
  /**
   * Merges Pulse and Health into the shapes' motion; a key set to null is removed, and a shape
   * left with neither has no motion at all, so it is written exactly as before (D116).
   */
  setNodeMotion: (nodeIds: string[], patch: { [K in keyof NodeMotion]?: NodeMotion[K] | null }) => void;

  /** Replaces the canvas with the bundled sample and marks this session as showing it. */
  startDemo: (doc: DiagramDocument) => void;
  /** Retires the sample for good: clears it from localStorage-backed state and stops it returning. */
  dismissDemo: () => void;
  /** Retires the sample AND replaces it with an empty canvas ("Start a blank canvas"). */
  startBlankCanvas: () => void;
  /** Advances the coach-mark tour. TOUR_FINISHED ends it and records tourDone + tourVersion. */
  setTourStep: (step: number) => void;
  /** Shows only the newest tour step, for a user who completed an earlier version. */
  startNewStepOnly: () => void;

  /**
   * Asks the Export menu to open (ui.exportMenuRequest is a counter, not a boolean: the tour's
   * "Show me" can be pressed twice, and a boolean that is already true produces no event).
   */
  setSidebarTab: (tab: SidebarTab) => void;
  /** Opens the "this page already has content" dialog for a template. */
  askTemplatePlacement: (templateId: string) => void;
  dismissTemplatePlacement: () => void;
  /**
   * Applies a template as ONE undoable command, child diagrams included — which is why it is a
   * single `doc` replacement rather than a sequence of addPage/addNode calls.
   */
  applyTemplate: (template: DiagramDocument, mode: ApplyMode) => string;
  requestExportMenu: () => void;
  /** Briefly highlights the export entries, so "Show me" points at something. */
  setExportHighlight: (on: boolean) => void;

  /**
   * Counts one mutating action toward the export reminder and opens the toast if one has
   * come due. Driven by onboarding/useExportReminder.ts watching `doc` identity rather than
   * called from each of the sixty-odd actions, for the same reason useDemoDiagram does it
   * that way: the command pattern already guarantees a new `doc` object per mutation.
   */
  noteDocumentMutation: () => void;
  /**
   * Records a successful export: zeroes the counter, closes any open toast and starts the
   * cooldown. Every path that hands the user a file calls this — File menu exports, the
   * local-only badge's download, and the toast's own button.
   */
  noteExport: () => void;
  /** "Later": closes the toast and spends one of the session's two reminders. */
  dismissExportReminder: () => void;

  /** Replaces whatever the notice strip is currently saying. */
  showNotice: (notice: Notice) => void;
  dismissNotice: () => void;
  /** Opens the import-notices panel; an empty list closes it. */
  showImportNotices: (notices: ImportNotice[]) => void;
  dismissImportNotices: () => void;
  dismissStartPanel: () => void;

  openShareDialog: () => void;
  closeShareDialog: () => void;

  openPptxDialog: () => void;
  closePptxDialog: () => void;
  openGifDialog: () => void;
  closeGifDialog: () => void;

  /**
   * Loads a document received through a share link, read-only. Deliberately NOT `loadDoc`:
   * this must never look like the user's own work, so nothing here may trigger a write to the
   * recipient's autosave — see share/ViewerShell.tsx, which is mounted instead of AppShell and
   * therefore never starts the autosave hook.
   */
  enterViewerMode: (doc: DiagramDocument) => void;
  /** "Edit a copy": keeps the shared document but hands it over to the normal editor. */
  exitViewerMode: () => void;
}

// Ports belong to the nested node in the *parent* diagram, but every port interaction the user
// performs happens from inside the child. This resolves "which nested node owns the ports for
// the diagram I'm currently looking at".
function findPortOwner(state: {
  navStack: string[];
  doc: DiagramDocument;
}): { parentDiagramId: string; nestedId: string } | null {
  const { navStack, doc } = state;
  if (navStack.length < 2) return null;
  const currentDiagramId = navStack[navStack.length - 1];
  const parentDiagramId = navStack[navStack.length - 2];
  const nested = doc.diagrams[parentDiagramId]?.nodes.find(
    (n): n is NestedNode => n.type === "nested" && n.childDiagramId === currentDiagramId,
  );
  return nested ? { parentDiagramId, nestedId: nested.id } : null;
}

export function createEmptyDoc(): DiagramDocument {
  const rootId = nanoid();
  const now = new Date().toISOString();
  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    meta: { title: `Untitled ${BRAND.name} diagram`, created: now, modified: now, appVersion: APP_VERSION },
    rootDiagramIds: [rootId],
    diagrams: {
      [rootId]: { id: rootId, title: "Page 1", nodes: [], edges: [], layers: createDefaultLayers() },
    },
  };
}

export const useDocStore = create<DocStoreState>()(
  temporal(
    (set, get) => {
      const doc = createEmptyDoc();
      const rootId = doc.rootDiagramIds[0];

      return {
        doc,
        docEpoch: 0,
        navStack: [rootId],
        selection: { nodeIds: [], edgeIds: [] },
        viewportByDiagramId: {},
        activeLayerByDiagram: {},
        ui: {
          notice: null,
          importNotices: null,
          startPanelDismissed: false,
          sidebarTab: readSidebarTab(),
          pendingTemplateId: null,
          exportMenuRequest: 0,
          exportHighlight: false,
          onboarding: {
            demoActive: false,
            demoDismissed: readDemoDismissed(),
            tourStep: 0,
            newStepOnly: false,
            actionsSinceExport: readActionsSinceExport(),
            remindersShown: 0,
            reminderOpen: false,
            lastExportAt: null,
          },
          viewerMode: false,
          gridEnabled: true,
          canvasGesture: false,
          tidyingUp: false,
          layoutDirection: readLayoutDirection(),
          openNoteId: null,
          cardSide: null,
          noteListOpen: false,
          noteAwaitingTitle: false,
          pageSettingsOpen: false,
          snapEnabled: true,
          shortcutsDialogOpen: false,
          paletteOpen: false,
          preferencesOpen: false,
          aboutOpen: false,
          shareDialogOpen: false,
          pptxDialogOpen: false,
          gifDialogOpen: false,
          layersPanelOpen: false,
          minimapOpen: false,
          findReplaceOpen: false,
          darkMode: readTheme() === "dark",
          motionEnabled: readMotionEnabled(),
          drawingIn: null,
          presentationPreview: null,
          deletePrompt: null,
        },
        trace: null,
        clipboard: null,
        clipboardEdges: null,
        editingNodeId: null,
        editingEdgeId: null,
        scratchpad: readScratchpad(),

        currentDiagramId: () => get().navStack[get().navStack.length - 1],
        // Guarded centrally rather than in each node/edge component: label editing is the one
        // mutation reachable purely by double-clicking the canvas, so one check here closes it
        // for shapes, groups, nested boxes and edge labels at once.
        setEditingNodeId: (id) => {
          if (get().ui.viewerMode) return;
          set({ editingNodeId: id });
        },
        setEditingEdgeId: (id) => {
          if (get().ui.viewerMode) return;
          set({ editingEdgeId: id });
        },

        loadDoc: (doc) => {
          // The document being replaced goes into Recent first (file/recentDocs.ts), so New, Open,
          // a template or a Recent entry never loses it. Not the sample (it is not the user's
          // work) and not in the read-only viewer, which never touches the user's own documents.
          const outgoing = get();
          if (!outgoing.ui.viewerMode && !outgoing.ui.onboarding.demoActive && hasContent(outgoing.doc)) {
            void rememberDocument(outgoing.doc).catch(() => {});
          }
          set({
            doc,
            docEpoch: get().docEpoch + 1,
            navStack: [doc.rootDiagramIds[0]],
            selection: { nodeIds: [], edgeIds: [] },
            viewportByDiagramId: {},
            activeLayerByDiagram: {},
            editingNodeId: null,
            editingEdgeId: null,
            trace: null,
            clipboard: null,
            clipboardEdges: null,
            // Notices about the previous document would point at pages that no longer exist; the
            // importer's caller shows the new document's own notices after loading it.
            ui: { ...get().ui, importNotices: null },
          });
          useDocStore.temporal.getState().clear();
        },

        setTrace: (focus) => {
          // A card asserts that the lit shapes are what it describes, so a trace the reader sets
          // or clears for themselves closes it. Opening a note sets its trace before opening the
          // note, so the note it is for survives this.
          if (get().ui.openNoteId) get().closeNote();
          set({ trace: focus && focus.length ? { diagramId: get().currentDiagramId(), focus } : null });
        },
        navigateInto: (nestedNodeId) => {
          const diagram = get().doc.diagrams[get().currentDiagramId()];
          const node = diagram.nodes.find((n) => n.id === nestedNodeId);
          if (!node || node.type !== "nested") return;
          if (get().ui.openNoteId) get().closeNote();
          // A trace that reaches the block follows the connection inside (D117).
          const trace = carryInto(get().doc, get().trace, nestedNodeId);
          set((s) => ({
            trace,
            navStack: [...s.navStack, node.childDiagramId],
            selection: { nodeIds: [], edgeIds: [] },
            editingNodeId: null,
            editingEdgeId: null,
          }));
        },
        navigateBack: () => {
          if (get().ui.openNoteId) get().closeNote();
          set((s) => {
            if (s.navStack.length <= 1) return s;
            return {
              trace: carryOut(s.doc, s.trace, s.navStack[s.navStack.length - 2]),
              navStack: s.navStack.slice(0, -1),
              selection: { nodeIds: [], edgeIds: [] },
              editingNodeId: null,
              editingEdgeId: null,
            };
          });
        },
        navigateToLevel: (index) => {
          set((s) => {
            if (index < 0 || index >= s.navStack.length) return s;
            return {
              // One level up carries the trace out, as Esc does; a longer jump starts afresh.
              trace: index === s.navStack.length - 2 ? carryOut(s.doc, s.trace, s.navStack[index]) : index === s.navStack.length - 1 ? s.trace : null,
              navStack: s.navStack.slice(0, index + 1),
              selection: { nodeIds: [], edgeIds: [] },
              editingNodeId: null,
              editingEdgeId: null,
            };
          });
        },
        navigateToDiagram: (diagramId) => {
          const path = nesting.findDiagramPath(get().doc, diagramId);
          if (!path) return;
          // Changing level by any route other than opening a note closes the open one; opening a
          // note navigates first and opens second, so its own card is not caught by this.
          if (get().ui.openNoteId) get().closeNote();
          set({
            trace: null,
            navStack: path,
            selection: { nodeIds: [], edgeIds: [] },
            editingNodeId: null,
            editingEdgeId: null,
          });
        },
        saveViewport: (diagramId, viewport) => {
          set((s) => ({ viewportByDiagramId: { ...s.viewportByDiagramId, [diagramId]: viewport } }));
        },

        addPage: (title) => {
          const { doc: nextDoc, pageId } = pages.addPage(
            get().doc,
            title ?? `Page ${get().doc.rootDiagramIds.length + 1}`,
          );
          set({
            doc: nextDoc,
            navStack: [pageId],
            selection: { nodeIds: [], edgeIds: [] },
            editingNodeId: null,
            editingEdgeId: null,
          });
          return pageId;
        },
        renamePage: (pageId, title) => {
          set({ doc: actions.renameDiagram(get().doc, pageId, title) });
        },
        removePage: (pageId) => {
          const nextDoc = pages.removePage(get().doc, pageId);
          if (nextDoc === get().doc) return; // refused (last remaining page, or unknown id)
          set({ doc: nextDoc });
          if (get().navStack[0] === pageId) {
            set({
              navStack: [nextDoc.rootDiagramIds[0]],
              selection: { nodeIds: [], edgeIds: [] },
              editingNodeId: null,
              editingEdgeId: null,
            });
          }
        },
        reorderPages: (fromIndex, toIndex) => {
          set({ doc: pages.reorderPages(get().doc, fromIndex, toIndex) });
        },
        switchPage: (pageId) => {
          if (!get().doc.diagrams[pageId] || get().navStack[0] === pageId) return;
          set({
            trace: null,
            navStack: [pageId],
            selection: { nodeIds: [], edgeIds: [] },
            editingNodeId: null,
            editingEdgeId: null,
          });
        },

        addNestedNode: (position, size, title) => {
          const diagramId = get().currentDiagramId();
          const { doc: created, nestedNodeId, childDiagramId } = nesting.addNestedNode(
            get().doc,
            diagramId,
            position,
            size,
            title,
          );
          const nextDoc = actions.updateNodes(created, diagramId, [
            { id: nestedNodeId, patch: { layerId: get().activeLayerId() } },
          ]);
          set({ doc: nextDoc });
          get().setSelection([nestedNodeId]);
          return { nestedNodeId, childDiagramId };
        },

        convertSelectionToNested: (title) => {
          const { selection } = get();
          if (selection.nodeIds.length === 0) return null;
          const result = nesting.convertSelectionToNested(get().doc, get().currentDiagramId(), selection.nodeIds, title);
          if (!result) return null;
          set({ doc: result.doc });
          get().setSelection([result.nestedNodeId]);
          return { nestedNodeId: result.nestedNodeId, childDiagramId: result.childDiagramId };
        },

        setNestedCollapsed: (nestedNodeId, patch) => {
          set({ doc: nesting.setNestedCollapsed(get().doc, get().currentDiagramId(), nestedNodeId, patch) });
        },
        addPort: (nestedNodeId, port) => {
          set({ doc: nesting.addPort(get().doc, get().currentDiagramId(), nestedNodeId, port) });
        },
        updatePort: (nestedNodeId, portId, patch) => {
          set({ doc: nesting.updatePort(get().doc, get().currentDiagramId(), nestedNodeId, portId, patch) });
        },
        removePort: (nestedNodeId, portId) => {
          set({ doc: nesting.removePort(get().doc, get().currentDiagramId(), nestedNodeId, portId) });
        },

        addShapeNode: (shapeRef, position, size) => {
          // A Lines stencil places a line, not a box (StencilDef.line): free at both ends, scaled
          // to the size it was dropped at. The id returned is then the line's.
          const stencil = getStencil(shapeRef);
          if (stencil?.line) {
            const { line } = stencil;
            const sx = size.w / stencil.defaultSize.w;
            const sy = size.h / stencil.defaultSize.h;
            const at = (p: { x: number; y: number }) => ({ x: position.x + p.x * sx, y: position.y + p.y * sy });
            return get().addLine({
              source: at(line.from),
              target: at(line.to),
              waypoints: line.waypoints?.map(at),
              style: { ...stencil.defaultStyle, ...line.style },
            });
          }
          const id = nanoid();
          const diagramId = get().currentDiagramId();
          const node: Omit<ShapeNode, "z"> = {
            id,
            type: "shape",
            shapeRef,
            position,
            size,
            style: newShapeStyle(getStencil(shapeRef)),
            layerId: get().activeLayerId(),
          };
          set({ doc: actions.addNode(get().doc, diagramId, node) });
          get().setSelection([id]);
          return id;
        },

        addShapeNodeFromScratchpad: (item, position) => {
          // A favourite Lines stencil is still a line.
          if (getStencil(item.shapeRef)?.line) return get().addShapeNode(item.shapeRef, position, item.size);
          const id = nanoid();
          const diagramId = get().currentDiagramId();
          const node: Omit<ShapeNode, "z"> = {
            id,
            type: "shape",
            shapeRef: item.shapeRef,
            position,
            size: item.size,
            style: item.style,
            label: item.label,
            layerId: get().activeLayerId(),
          };
          set({ doc: actions.addNode(get().doc, diagramId, node) });
          get().setSelection([id]);
          return id;
        },

        insertImages: (assets, center) => {
          if (assets.length === 0) return [];
          const result = imageOps.insertImages(get().doc, get().currentDiagramId(), assets, center, get().activeLayerId());
          set({ doc: result.doc });
          get().setSelection(result.nodeIds);
          return result.nodeIds;
        },

        replaceImage: (nodeId, asset) => {
          set({ doc: imageOps.replaceImage(get().doc, get().currentDiagramId(), nodeId, asset) });
        },

        resetImageSize: (nodeId) => {
          set({ doc: imageOps.resetImageSize(get().doc, get().currentDiagramId(), nodeId) });
        },

        // Favouriting straight from the sidebar (drag a stencil onto the Favorites section),
        // rather than having to place a shape on the canvas and right-click it first. Ignores a
        // stencil that's already saved, so repeat drops don't pile up duplicates.
        addStencilToScratchpad: (shapeRef, size) => {
          if (get().scratchpad.some((i) => i.shapeRef === shapeRef)) return;
          const next = [...get().scratchpad, scratchpadItemFromStencil(shapeRef, size)];
          writeScratchpad(next);
          set({ scratchpad: next });
        },

        addSelectionToScratchpad: () => {
          const { selection } = get();
          if (selection.nodeIds.length === 0) return;
          const diagram = get().doc.diagrams[get().currentDiagramId()];
          const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
          // A selected group has no shape of its own to capture; favorite each of its member
          // shapes instead, so grouping icons together doesn't remove the ability to favorite
          // them.
          const shapesToCapture: ShapeNode[] = [];
          for (const id of selection.nodeIds) {
            const node = byId.get(id);
            if (!node) continue;
            if (node.type === "shape") {
              shapesToCapture.push(node);
            } else if (node.type === "group") {
              for (const childId of node.childIds) {
                const child = byId.get(childId);
                if (child?.type === "shape") shapesToCapture.push(child);
              }
            }
          }
          if (shapesToCapture.length === 0) return;
          const next = [...get().scratchpad, ...shapesToCapture.map(captureScratchpadItem)];
          writeScratchpad(next);
          set({ scratchpad: next });
        },

        removeScratchpadItem: (itemId) => {
          const next = get().scratchpad.filter((i) => i.id !== itemId);
          writeScratchpad(next);
          set({ scratchpad: next });
        },

        moveOrResizeNodes: (updates) => {
          set({ doc: actions.updateNodes(get().doc, get().currentDiagramId(), updates) });
        },

        setNodeLabel: (nodeId, label) => {
          set({ doc: actions.setNodeLabel(get().doc, get().currentDiagramId(), nodeId, label), editingNodeId: null });
        },

        setNodeStyle: (nodeIds, patch) => {
          const diagram = get().doc.diagrams[get().currentDiagramId()];
          const updates: actions.NodePatch[] = nodeIds
            .map((id) => diagram.nodes.find((n) => n.id === id))
            .filter((n): n is NonNullable<typeof n> => n !== undefined)
            .map((n) => ({ id: n.id, patch: { style: { ...n.style, ...patch } } }));
          if (updates.length === 0) return;
          set({ doc: actions.updateNodes(get().doc, get().currentDiagramId(), updates) });
        },

        applyStylePreset: (nodeIds, { fill, stroke }) => {
          if (get().ui.viewerMode) return;
          const diagram = get().doc.diagrams[get().currentDiagramId()];
          const updates: actions.NodePatch[] = nodeIds
            .map((id) => diagram.nodes.find((n) => n.id === id))
            .filter((n): n is NonNullable<typeof n> => n !== undefined)
            .map((n) => {
              const style: StyleMap = { ...n.style };
              for (const [key, value] of [["fill", fill], ["stroke", stroke]] as const) {
                if (value === null) delete style[key];
                else style[key] = value;
              }
              return { id: n.id, patch: { style } };
            });
          if (updates.length === 0) return;
          set({ doc: actions.updateNodes(get().doc, get().currentDiagramId(), updates) });
        },

        setNodeLabelStyle: (nodeIds, patch) => {
          const diagramId = get().currentDiagramId();
          let doc = get().doc;
          const diagram = doc.diagrams[diagramId];
          for (const id of nodeIds) {
            const node = diagram.nodes.find((n) => n.id === id);
            if (!node) continue;
            const nextLabel: RichLabel = { text: "", ...node.label, ...patch };
            doc = actions.setNodeLabel(doc, diagramId, id, nextLabel);
          }
          set({ doc });
        },

        removeSelection: () => {
          const { selection } = get();
          if (selection.nodeIds.length === 0 && selection.edgeIds.length === 0) return;
          const diagramId = get().currentDiagramId();
          // A deletion that would take a level's contents or a parent's links with it asks first
          // (N7, D138); anything else goes at once, as before.
          const stakes = deletionStakes(get().doc, diagramId, selection.nodeIds);
          if (stakes.blocks.length || stakes.mapped.length) {
            set((s) => ({
              ui: { ...s.ui, deletePrompt: { diagramId, nodeIds: [...selection.nodeIds], edgeIds: [...selection.edgeIds], ...stakes } },
            }));
            return;
          }
          set({ doc: deleteCascading(get().doc, diagramId, selection.nodeIds, selection.edgeIds) });
          get().clearSelection();
        },

        resolveDeletePrompt: (choice) => {
          const prompt = get().ui.deletePrompt;
          set((s) => ({ ui: { ...s.ui, deletePrompt: null } }));
          if (!prompt || choice === "cancel") return;
          const { diagramId, nodeIds, edgeIds } = prompt;
          let doc = get().doc;
          let rest = nodeIds;
          if (choice === "keep-contents") {
            const lifted = prompt.blocks.map((b) => b.id);
            doc = liftNestedContents(doc, diagramId, lifted);
            rest = nodeIds.filter((id) => !lifted.includes(id));
          }
          if (choice === "remove-links") doc = removeLinksThrough(doc, diagramId, prompt.mapped.map((m) => m.id));
          // "keep-waiting" and "delete-all" are the plain delete: an orphaned port stays, unmapped,
          // waiting to be relinked (D12), and a block's levels go with it. One undo entry, either way.
          set({ doc: deleteCascading(doc, diagramId, rest, edgeIds) });
          get().clearSelection();
        },

        bringToFront: (nodeIds) => {
          set({ doc: actions.bringToFront(get().doc, get().currentDiagramId(), nodeIds) });
        },
        sendToBack: (nodeIds) => {
          set({ doc: actions.sendToBack(get().doc, get().currentDiagramId(), nodeIds) });
        },
        moveForward: (nodeIds) => {
          set({ doc: actions.moveForward(get().doc, get().currentDiagramId(), nodeIds) });
        },
        moveBackward: (nodeIds) => {
          set({ doc: actions.moveBackward(get().doc, get().currentDiagramId(), nodeIds) });
        },
        alignSelection: (mode) => {
          set({ doc: actions.alignNodes(get().doc, get().currentDiagramId(), get().selection.nodeIds, mode) });
        },
        tidyUp: async ({ direction, scope }) => {
          if (get().ui.viewerMode || get().ui.tidyingUp) return;
          const diagramId = get().currentDiagramId();
          // Asking for a direction sets the one later tidy-ups use, so someone who works top to
          // bottom chooses it once.
          const chosen = direction ?? get().ui.layoutDirection;
          if (direction && direction !== get().ui.layoutDirection) writeLayoutDirection(direction);
          const options = {
            direction: chosen,
            nodeIds: scope === "selection" ? get().selection.nodeIds : undefined,
            relayoutLines: true,
            snap: get().ui.snapEnabled ? GRID_SIZE : undefined,
          };
          set((s) => ({ ui: { ...s.ui, tidyingUp: true, layoutDirection: chosen } }));
          try {
            const engine = await loadLayoutEngine();
            const run = scope === "all-levels" ? autoLayoutAllLevels : autoLayout;
            // Laid out from the document as it was when the engine was asked, then applied to the
            // document as it is now: only the very first run waits on anything slow (the engine
            // itself), and a shape deleted in the meantime is simply one the layout no longer
            // finds, not a failure.
            const doc = await run(get().doc, diagramId, options, engine);
            set({ doc });
          } catch {
            get().showNotice({ message: "The diagram could not be tidied up.", tone: "warn" });
          } finally {
            set((s) => ({ ui: { ...s.ui, tidyingUp: false } }));
          }
        },
        distributeSelection: (axis) => {
          set({ doc: actions.distributeNodes(get().doc, get().currentDiagramId(), get().selection.nodeIds, axis) });
        },

        addNote: (focus, text) => {
          if (get().ui.viewerMode) return null;
          if (!get().doc.diagrams[focus.diagramId]) return null;
          const id = nanoid();
          const body = text ?? "";
          const doc = get().doc;
          set({
            doc: {
              ...doc,
              meta: { ...doc.meta, modified: new Date().toISOString() },
              notes: [...(doc.notes ?? []), { id, body, focus }],
            },
          });
          get().openNote(id);
          set((s) => ({ ui: { ...s.ui, noteAwaitingTitle: true } }));
          return id;
        },
        updateNote: (id, patch) => {
          const doc = get().doc;
          if (!doc.notes?.some((n) => n.id === id)) return;
          set({
            doc: {
              ...doc,
              meta: { ...doc.meta, modified: new Date().toISOString() },
              notes: doc.notes.map((n) =>
                n.id === id
                  ? {
                      ...n,
                      ...(patch.body !== undefined ? { body: patch.body } : {}),
                      // An emptied title is removed rather than stored blank, so the note falls
                      // back to the first line of its text as a note without one always has.
                      ...(patch.title !== undefined
                        ? patch.title.trim() === ""
                          ? { title: undefined }
                          : { title: patch.title }
                        : {}),
                    }
                  : n,
              ),
            },
          });
        },
        deleteNote: (id) => {
          const doc = get().doc;
          if (!doc.notes?.some((n) => n.id === id)) return;
          const notes = doc.notes.filter((n) => n.id !== id);
          const meta = { ...doc.meta, modified: new Date().toISOString() };
          // The last note leaves no empty array behind: a document with none is the document it
          // was before anyone wrote one.
          set({ doc: notes.length > 0 ? { ...doc, meta, notes } : { ...doc, meta, notes: undefined } });
          if (get().ui.openNoteId === id) get().closeNote();
        },
        reorderNotes: (fromIndex, toIndex) => {
          const doc = get().doc;
          const notes = doc.notes;
          if (!notes || fromIndex === toIndex) return;
          if (fromIndex < 0 || fromIndex >= notes.length || toIndex < 0 || toIndex >= notes.length) return;
          const next = [...notes];
          next.splice(toIndex, 0, ...next.splice(fromIndex, 1));
          set({ doc: { ...doc, meta: { ...doc.meta, modified: new Date().toISOString() }, notes: next } });
        },
        setNoteFocus: (id, focus) => {
          const doc = get().doc;
          if (!doc.notes?.some((n) => n.id === id)) return;
          if (!doc.diagrams[focus.diagramId]) return;
          set({
            doc: {
              ...doc,
              meta: { ...doc.meta, modified: new Date().toISOString() },
              notes: doc.notes.map((n) => (n.id === id ? { ...n, focus } : n)),
            },
          });
        },
        openNote: (id) => set((s) => ({ ui: { ...s.ui, openNoteId: id, noteAwaitingTitle: false } })),
        // Closing keeps the side: the next note opens where the last card was, which is what makes
        // the hysteresis worth having. The list, which belongs to one reading, does not survive.
        closeNote: () =>
          set((s) =>
            s.ui.openNoteId === null && !s.ui.noteListOpen
              ? s
              : { ui: { ...s.ui, openNoteId: null, noteListOpen: false, noteAwaitingTitle: false } },
          ),
        setCardSide: (side) => set((s) => (s.ui.cardSide === side ? s : { ui: { ...s.ui, cardSide: side } })),
        setNoteListOpen: (open) => set((s) => (s.ui.noteListOpen === open ? s : { ui: { ...s.ui, noteListOpen: open } })),

        groupSelection: () => {
          const result = groups.groupNodes(get().doc, get().currentDiagramId(), get().selection.nodeIds);
          if (!result) return null;
          set({ doc: result.doc });
          get().setSelection([result.groupId]);
          return result.groupId;
        },
        ungroupSelection: () => {
          const { selection } = get();
          const diagram = get().doc.diagrams[get().currentDiagramId()];
          // Resolves whichever group the current selection "belongs to," however it was
          // selected: the group's own id directly, its member shapes directly (e.g. via
          // rubber-band, which selects children individually), or a
          // mix of both (a rubber-band sweeping over the group's own invisible frame *and* its
          // children reports all of their ids together — see D33's follow-up fix). A node
          // qualifies as "in" a group if it IS that group or is one of its listed children.
          const group = diagram.nodes.find(
            (n) =>
              n.type === "group" &&
              selection.nodeIds.length > 0 &&
              selection.nodeIds.every((id) => id === n.id || n.childIds.includes(id)),
          );
          if (!group || group.type !== "group") return;
          const childIds = group.childIds;
          set({ doc: groups.ungroupNodes(get().doc, get().currentDiagramId(), group.id) });
          get().setSelection(childIds);
        },

        connect: (args) => {
          const { doc, edgeId } = connectNodes(get().doc, get().currentDiagramId(), args);
          set({ doc });
          get().setSelection([], [edgeId]);
          return edgeId;
        },

        addConnectedCopy: (nodeId, side) => {
          if (get().ui.viewerMode) return null;
          const result = addConnectedCopyToDoc(get().doc, get().currentDiagramId(), nodeId, side, {
            grid: get().ui.snapEnabled ? GRID_SIZE : null,
            layerId: get().activeLayerId(),
          });
          if (!result) return null;
          set({ doc: result.doc });
          get().setSelection([result.nodeId]);
          get().setEditingNodeId(result.nodeId);
          return result.nodeId;
        },

        addLine: ({ source, target, waypoints, style }) => {
          const id = nanoid();
          const line: DEdge = {
            id,
            source: { point: source },
            target: { point: target },
            ...(waypoints && waypoints.length > 0 ? { waypoints } : {}),
            style: { edgeStyle: "straight", startArrow: "none", endArrow: "none", ...style },
            layerId: get().activeLayerId(),
          };
          set({ doc: actions.addEdge(get().doc, get().currentDiagramId(), line) });
          get().setSelection([], [id]);
          return id;
        },

        connectToPoint: (sourceNodeId, sourceHandleId, point) => {
          const diagramId = get().currentDiagramId();
          const id = nanoid();
          const src = nesting.ensurePortForConnection(get().doc, diagramId, sourceNodeId, parsePortId(sourceHandleId), sourceHandleId, "out");
          const edge: DEdge = {
            id,
            source: { nodeId: sourceNodeId, portId: src.portId },
            target: { point },
            // The same look connect() gives a finished connection, so attaching the loose end
            // later changes nothing but where it ends.
            style: { edgeStyle: "curved", startArrow: "none", endArrow: "open", sourceHandle: sourceHandleId },
            layerId: get().activeLayerId(),
          };
          set({ doc: actions.addEdge(src.doc, diagramId, edge) });
          get().setSelection([], [id]);
          return id;
        },

        setEdgeEndPoint: (edgeId, end, point) => {
          const diagramId = get().currentDiagramId();
          const existing = get().doc.diagrams[diagramId]?.edges.find((e) => e.id === edgeId);
          if (!existing) return;
          // The handle name only means something on a node; a free end leaves toward its neighbour.
          const { [end === "source" ? "sourceHandle" : "targetHandle"]: _dropped, ...style } = existing.style;
          void _dropped;
          set({ doc: actions.updateEdge(get().doc, diagramId, edgeId, { [end]: { point }, style }) });
        },

        moveEdges: (edgeIds, dx, dy) => {
          if (edgeIds.length === 0 || (dx === 0 && dy === 0)) return;
          const ids = new Set(edgeIds);
          set({
            doc: actions.updateDiagram(get().doc, get().currentDiagramId(), (d) => ({
              ...d,
              edges: d.edges.map((e) => (ids.has(e.id) && hasFreeEnd(e) ? shiftEdge(e, dx, dy) : e)),
            })),
          });
        },

        renameNestedNode: (nestedNodeId, label) => {
          set({ doc: nesting.renameNestedNode(get().doc, get().currentDiagramId(), nestedNodeId, label) });
          set({ editingNodeId: null });
        },

        // Drag either end of an existing edge onto a different shape instead of deleting and
        // redrawing it. Goes through ensurePortForConnection like connect() does, so dropping
        // an end on a nested node's body creates a port there too rather than silently
        // producing a portless end.
        reconnectEdge: (edgeId, end, nodeId, handleId) => {
          const diagramId = get().currentDiagramId();
          const existing = get().doc.diagrams[diagramId]?.edges.find((e) => e.id === edgeId);
          if (!existing) return;

          const ensured = nesting.ensurePortForConnection(
            get().doc,
            diagramId,
            nodeId,
            parsePortId(handleId),
            handleId,
            end === "target" ? "in" : "out",
            // Dropping this edge back onto the port it already uses is not a clash with itself.
            edgeId,
          );
          const newEnd = { nodeId, portId: ensured.portId };
          const patch =
            end === "source"
              ? { source: newEnd, style: { ...existing.style, sourceHandle: handleId } }
              : { target: newEnd, style: { ...existing.style, targetHandle: handleId } };
          set({ doc: actions.updateEdge(ensured.doc, diagramId, edgeId, patch) });
        },

        // Links a waiting port to a node inside the diagram currently being viewed, optionally
        // recording which side of that node it attaches to. Called from inside the *child*, so
        // it reaches up one level to the parent that owns the nested node — the port lives on
        // the parent's node, not in this diagram.
        mapUnlinkedPort: (portId, innerNodeId, side) => {
          const owner = findPortOwner(get());
          if (!owner) return;
          const patch = side ? { innerNodeId, side } : { innerNodeId };
          set({ doc: nesting.updatePort(get().doc, owner.parentDiagramId, owner.nestedId, portId, patch) });
        },

        // Detaches a mapped port back to the waiting state — the counterpart of the above, so a
        // parent connection can be pulled off a shape and dropped somewhere else rather than
        // being stuck wherever it first landed.
        detachPort: (portId) => {
          const owner = findPortOwner(get());
          if (!owner) return;
          set({
            doc: nesting.updatePort(get().doc, owner.parentDiagramId, owner.nestedId, portId, {
              innerNodeId: undefined,
            }),
          });
        },

        updateEdgeWaypoints: (edgeId, waypoints) => {
          set({ doc: actions.updateEdge(get().doc, get().currentDiagramId(), edgeId, { waypoints }) });
        },
        setEdgeLabel: (edgeId, label) => {
          set({
            doc: actions.updateEdge(get().doc, get().currentDiagramId(), edgeId, { label }),
            editingEdgeId: null,
          });
        },
        setEdgeLabelPosition: (edgeIds, position) => {
          if (get().ui.viewerMode || edgeIds.length === 0) return;
          let doc = get().doc;
          const diagramId = get().currentDiagramId();
          for (const id of edgeIds) {
            doc = position
              ? actions.updateEdge(doc, diagramId, id, { labelPosition: position })
              : actions.updateDiagram(doc, diagramId, (d) => ({
                  ...d,
                  edges: d.edges.map((e) => {
                    if (e.id !== id || !e.labelPosition) return e;
                    const rest = { ...e };
                    delete rest.labelPosition;
                    return rest;
                  }),
                }));
          }
          if (doc !== get().doc) set({ doc });
        },
        setEdgeStyle: (edgeIds, patch) => {
          const diagramId = get().currentDiagramId();
          let doc = get().doc;
          const diagram = doc.diagrams[diagramId];
          for (const id of edgeIds) {
            const edge = diagram.edges.find((e) => e.id === id);
            if (!edge) continue;
            doc = actions.updateEdge(doc, diagramId, id, { style: { ...edge.style, ...patch } });
          }
          set({ doc });
        },

        setEdgeLabelStyle: (edgeIds, patch) => {
          const diagramId = get().currentDiagramId();
          let doc = get().doc;
          const diagram = doc.diagrams[diagramId];
          for (const id of edgeIds) {
            const edge = diagram.edges.find((e) => e.id === id);
            if (!edge) continue;
            const nextLabel: RichLabel = { text: "", ...edge.label, ...patch };
            doc = actions.updateEdge(doc, diagramId, id, { label: nextLabel });
          }
          set({ doc });
        },

        // The share-link viewer selects nothing (D117): a reader has no use for resize handles, and
        // a click there traces instead. It had been selecting on click since the viewer began.
        setSelection: (nodeIds, edgeIds = []) => {
          if (get().ui.viewerMode && (nodeIds.length > 0 || edgeIds.length > 0)) return;
          // Selecting does not close an open note. What a card claims is that the *lit* shapes are
          // what it describes, and lighting is the trace, which selecting does not touch. Keeping
          // it open is also what makes "set to selection" reachable: choose the shapes, then point
          // the note at them. Setting or clearing a trace, changing level and Escape still close it.
          set({ selection: { nodeIds, edgeIds } });
        },
        clearSelection: () => set({ selection: { nodeIds: [], edgeIds: [] } }),
        selectAll: () => {
          const diagram = get().doc.diagrams[get().currentDiagramId()];
          get().setSelection(
            diagram.nodes.map((n) => n.id),
            diagram.edges.map((e) => e.id),
          );
        },

        copySelection: () => {
          const { selection, doc: currentDoc } = get();
          const diagram = currentDoc.diagrams[get().currentDiagramId()];
          const nodes = diagram.nodes.filter((n: DNode) => selection.nodeIds.includes(n.id));
          const edges = edgesToCopy(diagram.edges, new Set(selection.nodeIds), new Set(selection.edgeIds));
          set({ clipboard: nodes.length > 0 ? nodes : null, clipboardEdges: edges.length > 0 ? edges : null });
        },
        cutSelection: () => {
          get().copySelection();
          get().removeSelection();
        },

        duplicateSelection: () => {
          const { selection } = get();
          if (selection.nodeIds.length === 0 && selection.edgeIds.length === 0) return;
          const { doc: nextDoc, newIds, newEdgeIds } = actions.duplicateNodes(get().doc, get().currentDiagramId(), selection.nodeIds, selection.edgeIds);
          set({ doc: nextDoc });
          get().setSelection(newIds, newEdgeIds);
        },

        pasteClipboard: () => {
          const { clipboard, clipboardEdges } = get();
          if ((!clipboard || clipboard.length === 0) && (!clipboardEdges || clipboardEdges.length === 0)) return;
          const diagramId = get().currentDiagramId();
          let doc = get().doc;
          const newIds: string[] = [];
          const idMap = new Map<string, string>();
          for (const node of clipboard ?? []) {
            const id = nanoid();
            newIds.push(id);
            idMap.set(node.id, id);
            const pasted: DNode = {
              ...node,
              id,
              position: { x: node.position.x + 20, y: node.position.y + 20 },
            };
            doc = actions.addNode(doc, diagramId, pasted);
          }
          const pastedEdges = copyEdges(clipboardEdges ?? [], idMap, nanoid, 20, 20);
          for (const edge of pastedEdges) doc = actions.addEdge(doc, diagramId, edge);
          set({ doc });
          get().setSelection(newIds, pastedEdges.map((e) => e.id));
        },

        startDemo: (demo) => {
          get().loadDoc(demo);
          set((s) => ({ ui: { ...s.ui, onboarding: { ...s.ui.onboarding, demoActive: true } } }));
        },
        setTourStep: (step) => {
          // Reaching the end records both that the tour ran and which version of it, so a
          // later addition can show just the new step instead of the whole thing again.
          if (step >= TOUR_FINISHED) {
            writeTourDone();
            writeTourVersion();
          }
          set((s) => ({
            ui: {
              ...s.ui,
              onboarding: { ...s.ui.onboarding, tourStep: step, newStepOnly: step >= TOUR_FINISHED ? false : s.ui.onboarding.newStepOnly },
            },
          }));
        },
        /** Shows only the newest step, to someone who finished an earlier tour version. */
        startNewStepOnly: () => {
          set((s) => ({
            ui: { ...s.ui, onboarding: { ...s.ui.onboarding, tourStep: TOUR_LAST_STEP, newStepOnly: true } },
          }));
        },

        noteDocumentMutation: () => {
          const { onboarding, viewerMode } = get().ui;
          // Read-only viewers can't change anything worth exporting, so nothing to count.
          if (viewerMode) return;
          const actionsSinceExport = onboarding.actionsSinceExport + 1;
          writeActionsSinceExport(actionsSinceExport);
          const reminderOpen = shouldShowExportReminder({
            actionsSinceExport,
            remindersShown: onboarding.remindersShown,
            reminderOpen: onboarding.reminderOpen,
            lastExportAt: onboarding.lastExportAt,
            now: Date.now(),
            demoActive: onboarding.demoActive,
            tourInProgress: onboarding.tourStep >= 1 && onboarding.tourStep <= TOUR_LAST_STEP,
            viewerMode,
          });
          set((s) => ({
            ui: {
              ...s.ui,
              onboarding: {
                ...s.ui.onboarding,
                actionsSinceExport,
                reminderOpen: reminderOpen || s.ui.onboarding.reminderOpen,
              },
            },
          }));
        },
        noteExport: () => {
          writeActionsSinceExport(0);
          set((s) => ({
            ui: {
              ...s.ui,
              onboarding: {
                ...s.ui.onboarding,
                actionsSinceExport: 0,
                reminderOpen: false,
                lastExportAt: Date.now(),
              },
            },
          }));
        },
        dismissExportReminder: () => {
          set((s) => ({
            ui: {
              ...s.ui,
              onboarding: {
                ...s.ui.onboarding,
                reminderOpen: false,
                // Spending the reminder here, not when it opened, is what makes the re-arm
                // mean "40 more changes after they waved it away".
                remindersShown: s.ui.onboarding.remindersShown + 1,
              },
            },
          }));
        },

        enterViewerMode: (doc) => {
          get().loadDoc(doc);
          set((s) => ({
            // The sample and its coach marks belong to a first-time author, not to someone who
            // followed a link to read a colleague's diagram.
            ui: { ...s.ui, viewerMode: true, onboarding: { ...s.ui.onboarding, demoActive: false, tourStep: TOUR_FINISHED } },
          }));
        },
        exitViewerMode: () => {
          set((s) => ({ ui: { ...s.ui, viewerMode: false } }));
        },
        dismissDemo: () => {
          if (get().ui.onboarding.demoDismissed && !get().ui.onboarding.demoActive) return;
          writeDemoDismissed();
          writeTourDone();
          set((s) => ({
            ui: {
              ...s.ui,
              onboarding: { ...s.ui.onboarding, demoActive: false, demoDismissed: true, tourStep: TOUR_FINISHED },
            },
          }));
        },
        startBlankCanvas: () => {
          get().loadDoc(createEmptyDoc());
          writeDemoDismissed();
          writeTourDone();
          set((s) => ({
            ui: {
              ...s.ui,
              onboarding: { ...s.ui.onboarding, demoActive: false, demoDismissed: true, tourStep: TOUR_FINISHED },
            },
          }));
        },

        setSidebarTab: (tab) => {
          writeSidebarTab(tab);
          set((s) => ({ ui: { ...s.ui, sidebarTab: tab } }));
        },
        askTemplatePlacement: (templateId) => set((s) => ({ ui: { ...s.ui, pendingTemplateId: templateId } })),
        dismissTemplatePlacement: () => set((s) => ({ ui: { ...s.ui, pendingTemplateId: null } })),
        applyTemplate: (template, mode) => {
          const { doc, pageId } = applyTemplateToDoc(get().doc, template, mode, get().currentDiagramId());
          set({
            doc,
            navStack: [pageId],
            selection: { nodeIds: [], edgeIds: [] },
            editingNodeId: null,
            editingEdgeId: null,
          });
          // Starting from a template is starting your own diagram, so the sample must not come
          // back on the next visit and sit on top of it.
          get().dismissDemo();
          set((s) => ({ ui: { ...s.ui, pendingTemplateId: null } }));
          return pageId;
        },
        requestExportMenu: () => set((s) => ({ ui: { ...s.ui, exportMenuRequest: s.ui.exportMenuRequest + 1 } })),
        setExportHighlight: (on) => set((s) => ({ ui: { ...s.ui, exportHighlight: on } })),

        openPptxDialog: () => set((s) => ({ ui: { ...s.ui, pptxDialogOpen: true } })),
        closePptxDialog: () => set((s) => ({ ui: { ...s.ui, pptxDialogOpen: false } })),
        openGifDialog: () => set((s) => ({ ui: { ...s.ui, gifDialogOpen: true } })),
        closeGifDialog: () => set((s) => ({ ui: { ...s.ui, gifDialogOpen: false } })),

        openShareDialog: () => set((s) => ({ ui: { ...s.ui, shareDialogOpen: true } })),
        closeShareDialog: () => set((s) => ({ ui: { ...s.ui, shareDialogOpen: false } })),

        showNotice: (notice) => set((s) => ({ ui: { ...s.ui, notice } })),
        dismissNotice: () => set((s) => ({ ui: { ...s.ui, notice: null } })),
        showImportNotices: (notices) =>
          set((s) => ({ ui: { ...s.ui, importNotices: notices.length ? notices : null } })),
        dismissImportNotices: () => set((s) => ({ ui: { ...s.ui, importNotices: null } })),
        dismissStartPanel: () => set((s) => ({ ui: { ...s.ui, startPanelDismissed: true } })),

        toggleGrid: () => set((s) => ({ ui: { ...s.ui, gridEnabled: !s.ui.gridEnabled } })),
        setCanvasGesture: (active) => {
          if (get().ui.canvasGesture !== active) set((s) => ({ ui: { ...s.ui, canvasGesture: active } }));
        },
        setPageSettingsOpen: (open) => {
          if (get().ui.pageSettingsOpen !== open) set((s) => ({ ui: { ...s.ui, pageSettingsOpen: open } }));
        },
        toggleSnap: () => set((s) => ({ ui: { ...s.ui, snapEnabled: !s.ui.snapEnabled } })),
        toggleShortcutsDialog: () => set((s) => ({ ui: { ...s.ui, shortcutsDialogOpen: !s.ui.shortcutsDialogOpen } })),
        setPaletteOpen: (open) => set((s) => ({ ui: { ...s.ui, paletteOpen: open } })),
        setPreferencesOpen: (open) => set((s) => ({ ui: { ...s.ui, preferencesOpen: open } })),
        setAboutOpen: (open) => set((s) => ({ ui: { ...s.ui, aboutOpen: open } })),
        setDiagramBackground: (color) => {
          set({ doc: actions.setDiagramBackground(get().doc, get().currentDiagramId(), color) });
        },
        setDiagramPageSize: (size) => {
          set({ doc: actions.setDiagramPageSize(get().doc, get().currentDiagramId(), size) });
        },

        currentLayers: () => {
          const diagram = get().doc.diagrams[get().currentDiagramId()];
          return diagram ? getLayers(diagram) : [];
        },
        // New shapes land here (as in any layered editor: the panel's currently-selected layer
        // is where new content goes). Falls back to the diagram's first layer if nothing was
        // explicitly chosen yet, or if the previously-active layer was since deleted.
        activeLayerId: () => {
          const diagramId = get().currentDiagramId();
          const layers = get().currentLayers();
          const stored = get().activeLayerByDiagram[diagramId];
          return stored && layers.some((l) => l.id === stored) ? stored : layers[0]?.id;
        },
        setActiveLayer: (layerId) => {
          set((s) => ({ activeLayerByDiagram: { ...s.activeLayerByDiagram, [get().currentDiagramId()]: layerId } }));
        },
        addLayer: (name) => {
          const diagramId = get().currentDiagramId();
          const { doc: nextDoc, layerId } = layers.addLayer(
            get().doc,
            diagramId,
            name ?? `Layer ${get().currentLayers().length + 1}`,
          );
          set({ doc: nextDoc });
          get().setActiveLayer(layerId);
          return layerId;
        },
        renameLayer: (layerId, name) => {
          set({ doc: layers.renameLayer(get().doc, get().currentDiagramId(), layerId, name) });
        },
        removeLayer: (layerId) => {
          set({ doc: layers.removeLayer(get().doc, get().currentDiagramId(), layerId) });
        },
        setLayerVisible: (layerId, visible) => {
          set({ doc: layers.setLayerVisible(get().doc, get().currentDiagramId(), layerId, visible) });
        },
        setLayerLocked: (layerId, locked) => {
          set({ doc: layers.setLayerLocked(get().doc, get().currentDiagramId(), layerId, locked) });
        },
        reorderLayer: (fromIndex, toIndex) => {
          set({ doc: layers.reorderLayer(get().doc, get().currentDiagramId(), fromIndex, toIndex) });
        },
        moveSelectionToLayer: (layerId) => {
          const { nodeIds } = get().selection;
          if (nodeIds.length === 0) return;
          set({ doc: layers.moveSelectionToLayer(get().doc, get().currentDiagramId(), nodeIds, layerId) });
        },
        toggleLayersPanel: () => set((s) => ({ ui: { ...s.ui, layersPanelOpen: !s.ui.layersPanelOpen } })),
        toggleMinimap: () => set((s) => ({ ui: { ...s.ui, minimapOpen: !s.ui.minimapOpen } })),
        toggleFindReplace: () => set((s) => ({ ui: { ...s.ui, findReplaceOpen: !s.ui.findReplaceOpen } })),
        replaceAllMatches: (query, replacement, matchCase) => {
          const diagramId = get().currentDiagramId();
          const before = get().doc.diagrams[diagramId];
          const matches = findMatches(before, query, matchCase);
          let doc = get().doc;
          let changed = 0;
          for (const m of matches) {
            const newText = replaceOne(doc.diagrams[diagramId], m, query, replacement, matchCase);
            if (newText === undefined) continue;
            if (m.kind === "node") {
              const node = doc.diagrams[diagramId].nodes.find((n) => n.id === m.id);
              if (!node?.label) continue;
              doc = actions.setNodeLabel(doc, diagramId, m.id, { ...node.label, text: newText });
            } else {
              const edge = doc.diagrams[diagramId].edges.find((e) => e.id === m.id);
              if (!edge?.label) continue;
              doc = actions.updateEdge(doc, diagramId, m.id, { label: { ...edge.label, text: newText } });
            }
            changed++;
          }
          if (changed > 0) set({ doc });
          return changed;
        },
        setMotionEnabled: (on) => {
          writeMotionEnabled(on);
          set((s) => ({ ui: { ...s.ui, motionEnabled: on } }));
        },

        setDrawIn: (on) => {
          if (get().ui.viewerMode) return;
          set({ doc: setDiagramDrawIn(get().doc, get().currentDiagramId(), on) });
        },
        setPeek: (nestedNodeId, on) => {
          if (get().ui.viewerMode) return;
          set({ doc: setNestedPeek(get().doc, get().currentDiagramId(), nestedNodeId, on) });
        },
        setDrawingIn: (diagramId) => set((s) => ({ ui: { ...s.ui, drawingIn: diagramId } })),

        setPresentationMode: (mode) => {
          if (get().ui.viewerMode) return;
          set((s) => ({
            doc: setPresentationMode(s.doc, s.currentDiagramId(), mode),
            ui: { ...s.ui, presentationPreview: null },
          }));
        },
        setPresentationOrder: (order) => {
          if (get().ui.viewerMode) return;
          set({ doc: setPresentationOrder(get().doc, get().currentDiagramId(), order) });
        },
        setPresentationPreview: (on) => {
          const id = get().currentDiagramId();
          if (on && !get().doc.diagrams[id]?.motion?.presentation) return;
          set((s) => ({ ui: { ...s.ui, presentationPreview: on ? id : null } }));
        },

        setEdgeMotion: (edgeIds, motion) => {
          if (get().ui.viewerMode || edgeIds.length === 0) return;
          set({ doc: setEdgesMotion(get().doc, get().currentDiagramId(), edgeIds, motion) });
        },

        setNodeMotion: (nodeIds, patch) => {
          if (get().ui.viewerMode || nodeIds.length === 0) return;
          set({ doc: setNodesMotion(get().doc, get().currentDiagramId(), nodeIds, patch) });
        },

        toggleDarkMode: () => {
          const next = !get().ui.darkMode;
          writeTheme(next ? "dark" : "light");
          set((s) => ({ ui: { ...s.ui, darkMode: next } }));
        },
      };
    },
    {
      partialize: (state) => ({ doc: state.doc }),
      equality: (a, b) => a.doc === b.doc,
    },
  ),
);

export function useTemporalStore<T>(selector: (state: ReturnType<typeof useDocStore.temporal.getState>) => T): T {
  return useStore(useDocStore.temporal, selector);
}

/** Deletes shapes and lines with every cascade: a block's levels, groups, and ports into them. */
function deleteCascading(doc: DiagramDocument, diagramId: string, nodeIds: string[], edgeIds: string[]): DiagramDocument {
  const removeWithGroupCleanup = (d: DiagramDocument, dId: string, ns: string[], es: string[]): DiagramDocument => {
    const next = actions.removeSelection(d, dId, ns, es);
    return { ...next, diagrams: { ...next.diagrams, [dId]: groups.cascadeGroupCleanup(next.diagrams[dId], ns) } };
  };
  return nesting.removeSelectionCascading(doc, diagramId, nodeIds, edgeIds, removeWithGroupCleanup);
}
