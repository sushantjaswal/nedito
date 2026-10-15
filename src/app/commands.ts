// Every command the app offers, in one registry. The command palette
// lists these; the app menu, the Export button and the context bar are shorter surfaces onto the
// same actions. Labels are the ones the old menus used, so a command is recognisable by name, and
// each one's enablement is the rule its menu item followed.
//
// Built on demand from the current state rather than held reactively: the palette asks for the list
// when it opens and as you type, which is when "is Undo available right now" has to be true.
import { useDocStore } from "../model/store";
import { canGroupSelection, canUngroupSelection } from "../model/selectionGroup";
import { redoWithNavigation, undoWithNavigation } from "../model/undoNavigation";
import { getCanvasInstance, stepZoom } from "../canvas/canvasApi";
import { addConnectedCopyAndReveal } from "../canvas/addConnectedCopy";
import { chooseAndInsertImages, pasteFromMenu } from "./insertImage";
import { markShapesOnSystemClipboard } from "./systemClipboard";
import { showAbout, startQuickTour } from "./helpActions";
import { convertSelectionAndName } from "../nesting/navigation";
import { BRAND } from "./brand";
import type { Side } from "../model/connectedCopy";
import {
  copyImageLink,
  EXPORT_FORMATS,
  newDiagram,
  newFromTemplate,
  openFilePicker,
  print,
  runExport,
  saveCopy,
  share,
} from "./fileActions";

export interface Command {
  id: string;
  label: string;
  /** Where it belongs, shown beside it in the palette and searched like its label. */
  group: string;
  shortcut?: string;
  /** Other words it should be found by. */
  keywords?: string[];
  /** Offered but not runnable right now — as a greyed-out menu item was. */
  disabled?: boolean;
  /** For an on/off setting: whether it is on. */
  checked?: boolean;
  run: () => void | Promise<void>;
}

/** The words someone looks for auto-layout by; "tidy up" is what the commands are called. */
const TIDY_KEYWORDS = ["tidy", "layout", "auto layout", "arrange", "clean up", "organise", "organize", "untangle"];

export function getCommands(): Command[] {
  const s = useDocStore.getState();
  const temporal = useDocStore.temporal.getState();
  const nodeIds = s.selection.nodeIds;
  const nodes = s.doc.diagrams[s.currentDiagramId()]?.nodes ?? [];
  const hasSelection = nodeIds.length > 0 || s.selection.edgeIds.length > 0;
  const hasNodes = nodeIds.length > 0;
  // Selected lines whose label was dragged off the middle (D97).
  const edges = s.doc.diagrams[s.currentDiagramId()]?.edges ?? [];
  const movedLabels = edges.filter((e) => s.selection.edgeIds.includes(e.id) && e.labelPosition).map((e) => e.id);
  // The ＋ handles' click, for the keyboard (R3, D92): one shape or Nested Block selected.
  const sole = nodeIds.length === 1 ? nodes.find((n) => n.id === nodeIds[0]) : undefined;
  const canAddConnected = !s.ui.viewerMode && (sole?.type === "shape" || sole?.type === "nested");
  const addConnected = (side: Side) => () => void (sole && addConnectedCopyAndReveal(sole.id, side));
  const store = () => useDocStore.getState();
  const canTidy = !s.ui.viewerMode && !s.ui.tidyingUp && nodes.length > 1;

  return [
    // ---- documents
    { id: "new", label: "New diagram", group: "File", keywords: ["blank", "start"], run: newDiagram },
    { id: "new-template", label: "New from template…", group: "File", keywords: ["template", "start"], run: newFromTemplate },
    { id: "open", label: "Open…", group: "File", shortcut: "Ctrl+O", keywords: ["load", "import", "file"], run: openFilePicker },
    { id: "save", label: "Save a copy", group: "File", shortcut: "Ctrl+S", keywords: ["download", BRAND.fileExt], run: saveCopy },

    // ---- export and share
    { id: "copy-live-link", label: "Copy image with live link", group: "Share", keywords: ["clipboard", "word", "powerpoint", "paste"], run: copyImageLink },
    { id: "share", label: "Share…", group: "Share", keywords: ["link", "url"], run: share },
    ...EXPORT_FORMATS.map((f) => ({
      id: `export-${f.id}`,
      label: `Export to ${f.label}`,
      group: "Export",
      keywords: [f.ext, f.short, "download"],
      run: () => runExport(f),
    })),
    { id: "print", label: "Print…", group: "Export", keywords: ["paper"], run: print },

    // ---- edit
    { id: "undo", label: "Undo", group: "Edit", shortcut: "Ctrl+Z", disabled: temporal.pastStates.length === 0, run: undoWithNavigation },
    { id: "redo", label: "Redo", group: "Edit", shortcut: "Ctrl+Y", disabled: temporal.futureStates.length === 0, run: redoWithNavigation },
    { id: "cut", label: "Cut", group: "Edit", shortcut: "Ctrl+X", disabled: !hasSelection, run: () => (store().cutSelection(), markShapesOnSystemClipboard()) },
    { id: "copy", label: "Copy", group: "Edit", shortcut: "Ctrl+C", disabled: !hasSelection, run: () => (store().copySelection(), markShapesOnSystemClipboard()) },
    { id: "paste", label: "Paste", group: "Edit", shortcut: "Ctrl+V", run: () => void pasteFromMenu() },
    { id: "duplicate", label: "Duplicate", group: "Edit", shortcut: "Ctrl+D", disabled: !hasSelection, run: () => store().duplicateSelection() },
    { id: "delete", label: "Delete", group: "Edit", shortcut: "Del", disabled: !hasSelection, run: () => store().removeSelection() },
    { id: "select-all", label: "Select All", group: "Edit", shortcut: "Ctrl+A", run: () => store().selectAll() },
    { id: "select-none", label: "Select None", group: "Edit", shortcut: "Esc", disabled: !hasSelection, run: () => store().clearSelection() },
    { id: "find", label: "Find/Replace...", group: "Edit", shortcut: "Ctrl+F", keywords: ["search", "rename"], run: () => store().toggleFindReplace() },

    // ---- view
    { id: "zoom-in", label: "Zoom In", group: "View", shortcut: "Ctrl+=", run: () => stepZoom(1) },
    { id: "zoom-out", label: "Zoom Out", group: "View", shortcut: "Ctrl+-", run: () => stepZoom(-1) },
    { id: "zoom-reset", label: "Reset Zoom (100%)", group: "View", run: () => void getCanvasInstance()?.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 150 }) },
    { id: "fit", label: "Fit Page", group: "View", shortcut: "Ctrl+Shift+H", keywords: ["zoom to fit"], run: () => void getCanvasInstance()?.fitView({ duration: 200, padding: 0.2 }) },
    { id: "grid", label: "Show Grid", group: "View", checked: s.ui.gridEnabled, run: () => store().toggleGrid() },
    { id: "snap", label: "Snap to Grid", group: "View", checked: s.ui.snapEnabled, run: () => store().toggleSnap() },
    { id: "layers", label: "Layers", group: "View", checked: s.ui.layersPanelOpen, keywords: ["panel"], run: () => store().toggleLayersPanel() },
    { id: "outline", label: "Outline", group: "View", checked: s.ui.minimapOpen, keywords: ["minimap", "overview"], run: () => store().toggleMinimap() },
    { id: "dark", label: "Dark Mode", group: "View", checked: s.ui.darkMode, keywords: ["theme", "night"], run: () => store().toggleDarkMode() },

    // ---- arrange
    { id: "add-connected-right", label: "Add connected shape to the right", group: "Insert", shortcut: "Alt+Shift+→", keywords: ["plus", "next", "step", "clone", "connect"], disabled: !canAddConnected, run: addConnected("right") },
    { id: "add-connected-bottom", label: "Add connected shape below", group: "Insert", shortcut: "Alt+Shift+↓", keywords: ["plus", "next", "step", "clone", "connect"], disabled: !canAddConnected, run: addConnected("bottom") },
    { id: "add-connected-left", label: "Add connected shape to the left", group: "Insert", shortcut: "Alt+Shift+←", keywords: ["plus", "next", "step", "clone", "connect"], disabled: !canAddConnected, run: addConnected("left") },
    { id: "add-connected-top", label: "Add connected shape above", group: "Insert", shortcut: "Alt+Shift+↑", keywords: ["plus", "next", "step", "clone", "connect"], disabled: !canAddConnected, run: addConnected("top") },
    {
      id: "reset-label-position",
      label: "Reset label position",
      group: "Arrange",
      keywords: ["edge", "line", "label", "middle", "centre", "center"],
      disabled: !movedLabels.length,
      run: () => store().setEdgeLabelPosition(movedLabels, null),
    },
    { id: "insert-image", label: "Insert image…", group: "Insert", keywords: ["picture", "photo", "logo"], disabled: s.ui.viewerMode, run: () => void chooseAndInsertImages() },
    { id: "front", label: "To Front", group: "Arrange", shortcut: "Ctrl+Shift+F", disabled: !hasNodes, run: () => store().bringToFront(nodeIds) },
    { id: "back", label: "To Back", group: "Arrange", shortcut: "Ctrl+Shift+B", disabled: !hasNodes, run: () => store().sendToBack(nodeIds) },
    { id: "forward", label: "Bring Forward", group: "Arrange", disabled: !hasNodes, run: () => store().moveForward(nodeIds) },
    { id: "backward", label: "Send Backward", group: "Arrange", disabled: !hasNodes, run: () => store().moveBackward(nodeIds) },
    {
      // Trace (D117): what the one selected shape touches, across levels.
      id: "trace",
      label: s.trace ? "Stop tracing" : "Trace connections",
      group: "View",
      keywords: ["trace", "connections", "dependencies", "what talks to", "highlight", "related"],
      disabled: !s.trace && !(nodeIds.length === 1),
      run: () => store().setTrace(s.trace ? null : [nodeIds[0]]),
    },
    {
      // The right-click menu's offer, for the keyboard too: the same selection rule (D113).
      id: "convert-nested",
      label: "Convert to nested block",
      group: "Arrange",
      keywords: ["nest", "nested", "drill down", "subprocess", "level"],
      disabled: s.ui.viewerMode || !hasNodes || (nodeIds.length === 1 && nodes.some((n) => n.id === nodeIds[0] && (n.type === "nested" || n.type === "group"))),
      run: convertSelectionAndName,
    },
    { id: "group", label: "Group", group: "Arrange", shortcut: "Ctrl+G", disabled: !canGroupSelection(nodes, nodeIds), run: () => void store().groupSelection() },
    { id: "ungroup", label: "Ungroup", group: "Arrange", shortcut: "Ctrl+Shift+U", disabled: !canUngroupSelection(nodes, nodeIds), run: () => store().ungroupSelection() },
    ...(
      [
        ["left", "Align Left"],
        ["center-h", "Align Center"],
        ["right", "Align Right"],
        ["top", "Align Top"],
        ["middle-v", "Align Middle"],
        ["bottom", "Align Bottom"],
      ] as const
    ).map(([mode, label]) => ({ id: `align-${mode}`, label, group: "Arrange", disabled: nodeIds.length < 2, run: () => store().alignSelection(mode) })),
    { id: "distribute-h", label: "Distribute Horizontally", group: "Arrange", disabled: nodeIds.length < 3, run: () => store().distributeSelection("horizontal") },
    { id: "distribute-v", label: "Distribute Vertically", group: "Arrange", disabled: nodeIds.length < 3, run: () => store().distributeSelection("vertical") },
    // Auto-layout (model/layout.ts). The whole level is the common case, so it comes first and
    // keeps the plain name; the selection and the levels below it are the same command, scoped.
    {
      id: "tidy-level",
      label: "Tidy Up This Level",
      group: "Arrange",
      shortcut: "Ctrl+Shift+L",
      keywords: TIDY_KEYWORDS,
      disabled: !canTidy,
      run: () => store().tidyUp({ scope: "level" }),
    },
    {
      id: "tidy-level-right",
      label: "Tidy Up This Level, Left to Right",
      group: "Arrange",
      keywords: TIDY_KEYWORDS,
      checked: s.ui.layoutDirection === "right",
      disabled: !canTidy,
      run: () => store().tidyUp({ direction: "right", scope: "level" }),
    },
    {
      id: "tidy-level-down",
      label: "Tidy Up This Level, Top to Bottom",
      group: "Arrange",
      keywords: TIDY_KEYWORDS,
      checked: s.ui.layoutDirection === "down",
      disabled: !canTidy,
      run: () => store().tidyUp({ direction: "down", scope: "level" }),
    },
    {
      id: "tidy-selection",
      label: "Tidy Up Selection",
      group: "Arrange",
      keywords: TIDY_KEYWORDS,
      disabled: !canTidy || nodeIds.length < 2,
      run: () => store().tidyUp({ scope: "selection" }),
    },
    {
      id: "tidy-all-levels",
      label: "Tidy Up Every Level Below",
      group: "Arrange",
      keywords: [...TIDY_KEYWORDS, "nested", "all levels", "everything"],
      disabled: !canTidy || !nodes.some((n) => n.type === "nested"),
      run: () => store().tidyUp({ scope: "all-levels" }),
    },

    // ---- notes (model/notes.ts). Commands only for now: a note has no card to open yet, so the
    // one just added is the one the delete command acts on.
    {
      id: "add-note",
      // Not "...About Selection": the palette matches on the label, and the word about belongs to
      // the About command — typing it opened a new note instead (caught by the About e2e spec).
      label: hasNodes || s.selection.edgeIds.length > 0 ? "Add Note to Selection" : "Add Note for This Level",
      group: "Arrange",
      keywords: ["note", "notes", "comment", "annotate", "why", "write"],
      disabled: s.ui.viewerMode,
      run: () =>
        void store().addNote(
          {
            diagramId: s.currentDiagramId(),
            ...(nodeIds.length > 0 ? { nodeIds } : {}),
            ...(s.selection.edgeIds.length > 0 ? { edgeIds: s.selection.edgeIds } : {}),
          },
          "",
        ),
    },
    {
      id: "delete-note",
      label: "Delete Note",
      group: "Arrange",
      keywords: ["note", "notes", "remove note"],
      disabled: s.ui.viewerMode || !s.ui.openNoteId,
      run: () => s.ui.openNoteId && store().deleteNote(s.ui.openNoteId),
    },

    // ---- the page and the app
    {
      id: "diagram-settings",
      label: "Diagram Settings",
      group: "Page",
      keywords: ["page size", "background", "orientation"],
      run: () => (store().clearSelection(), store().setPageSettingsOpen(true)),
    },
    { id: "preferences", label: "Preferences…", group: "Help", keywords: ["settings", "dark", "theme"], run: () => store().setPreferencesOpen(true) },
    { id: "shortcuts", label: "Keyboard Shortcuts", group: "Help", shortcut: "Ctrl+Shift+K", keywords: ["keys"], run: () => store().toggleShortcutsDialog() },
    { id: "tour", label: "Take the tour", group: "Help", keywords: ["quick tour", "help", "learn"], run: startQuickTour },
    { id: "about", label: `About ${BRAND.name}`, group: "Help", run: showAbout },
  ];
}
