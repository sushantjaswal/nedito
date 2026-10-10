// What the File menu did, as plain actions anything can call: the app menu, the Export button, the
// command palette and the keyboard. The File menu itself is gone; its
// behaviour is unchanged — each action below is the old menu handler, moved.
import { downloadBlob, downloadText } from "../file/download";
import { saveDocument, toFilename } from "../file/saveDocument";
import { encodeEditablePng } from "../file/editablePngFormat";
import { openFile } from "../file/openFile";
import { copyImageWithLiveLink } from "../share/copyImageLink";
import { exportDocx } from "../export/docx/docxExport";
import { documentHasNestedBlock, liveLinkTipMessage, shouldShowLiveLinkTip } from "../onboarding/liveLinkTip";
import { readLiveLinkTipShown, writeLiveLinkTipShown } from "../onboarding/onboardingStorage";
import { diagramToPdfBlob, printDiagram } from "../file/pdfExport";
import { diagramToPngBlob } from "../file/pngExport";
import { renderDiagramSvg } from "../file/svgExport";
import { createEmptyDoc, TOUR_LAST_STEP, useDocStore } from "../model/store";
import { BRAND, EDITABLE_PNG_EXT } from "./brand";

// ---------------------------------------------------------------------------- documents

/** New: a blank diagram. The current one is kept under Recent (file/recentDocs.ts) as it goes. */
export function newDiagram(): void {
  if (!window.confirm("Start a new diagram? The current one stays under Recent in the app menu.")) return;
  useDocStore.getState().loadDoc(createEmptyDoc());
}

/** New from template: the sidebar's Templates tab. */
export function newFromTemplate(): void {
  useDocStore.getState().setSidebarTab("templates");
}

/**
 * The hidden file input Open uses. It lives in the app menu (always mounted while the editor is),
 * which registers it here so the palette and Ctrl+O can open the same picker.
 */
let openInput: HTMLInputElement | null = null;
export function registerOpenInput(input: HTMLInputElement | null): void {
  openInput = input;
}

/** Open…: the file picker; what is chosen goes through openSelectedFile. */
export function openFilePicker(): void {
  openInput?.click();
}

export async function openSelectedFile(file: File): Promise<void> {
  const result = await openFile(file);
  if (!result.ok) {
    window.alert(result.error);
    return;
  }
  useDocStore.getState().loadDoc(result.doc);
  // A best-effort import that changed something says so — after loadDoc, so the converted
  // diagram is already on screen behind the notes, which can then point into it.
  useDocStore.getState().showImportNotices(result.notices);
}

// Every export below that produces a file calls noteExport(), which zeroes the export reminder's
// change counter (onboarding/exportReminder.ts). Print does not: a print dialog does not leave the
// user holding a copy of their work.

/** Save a copy: the whole document as a .nedito file. */
export function saveCopy(): void {
  saveDocument(useDocStore.getState().doc);
  useDocStore.getState().noteExport();
}

function current() {
  const s = useDocStore.getState();
  return { s, diagram: s.doc.diagrams[s.currentDiagramId()] };
}

export async function exportSvg(): Promise<void> {
  const { s, diagram } = current();
  const svg = await renderDiagramSvg(diagram, { background: diagram.background ?? "#ffffff", diagrams: s.doc.diagrams, assets: s.doc.assets });
  downloadText(svg, toFilename(diagram.title, ".svg"), "image/svg+xml");
  s.noteExport();
}

export async function exportPng(): Promise<void> {
  const { s, diagram } = current();
  const blob = await diagramToPngBlob(diagram, { background: diagram.background ?? "#ffffff", scale: 2, diagrams: s.doc.diagrams, assets: s.doc.assets });
  downloadBlob(blob, toFilename(diagram.title, ".png"));
  s.noteExport();

  // The export happens first and unconditionally: the user asked for a PNG and gets one. The tip
  // is offered at the one moment it is useful — they are holding a dead picture and about to paste
  // it somewhere. Not on the editable .nedito.png, which already survives the round trip.
  const store = useDocStore.getState();
  const show = shouldShowLiveLinkTip({
    alreadyShown: readLiveLinkTipShown(),
    viewerMode: store.ui.viewerMode,
    tourInProgress: store.ui.onboarding.tourStep >= 1 && store.ui.onboarding.tourStep <= TOUR_LAST_STEP,
  });
  if (!show) return;
  writeLiveLinkTipShown();
  store.showNotice({ message: liveLinkTipMessage(documentHasNestedBlock(store.doc)), tone: "info", action: "copy-live-link" });
}

export async function exportEditablePng(): Promise<void> {
  const { s, diagram } = current();
  const blob = await encodeEditablePng(s.doc, diagram, { background: diagram.background ?? "#ffffff", scale: 2, diagrams: s.doc.diagrams, assets: s.doc.assets });
  downloadBlob(blob, toFilename(diagram.title, EDITABLE_PNG_EXT));
  s.noteExport();
}

export async function exportPdf(): Promise<void> {
  const { s, diagram } = current();
  const blob = await diagramToPdfBlob(diagram, { pageSize: diagram.pageSize, scale: 2, diagrams: s.doc.diagrams, assets: s.doc.assets });
  downloadBlob(blob, toFilename(diagram.title, ".pdf"));
  s.noteExport();
}

/**
 * The level as an animated GIF (G1, D131): for a web page or a post, where a moving picture says
 * what the diagram does. A diagram that does not move makes a still GIF, and says so.
 */
export function exportGif(): void {
  useDocStore.getState().openGifDialog();
}

/** Makes and saves the GIF at the size chosen in its dialog (G3, D141). */
export async function makeGif(
  { maxSide, frameMs }: { maxSide: number; frameMs: number },
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const { s, diagram } = current();
  const { diagramToGifBlob, moves } = await import("../file/gifExport");
  const moving = moves(diagram);
  try {
    const blob = await diagramToGifBlob(diagram, {
      background: diagram.background ?? "#ffffff",
      diagrams: s.doc.diagrams,
      assets: s.doc.assets,
      maxSide,
      frameMs,
      onProgress,
    });
    downloadBlob(blob, toFilename(diagram.title, ".gif"));
    s.noteExport();
    useDocStore.getState().showNotice({
      message: moving
        ? `GIF saved (${Math.max(1, Math.round(blob.size / 1024))} KB). It loops, so it can go straight into a page or a post.`
        : "GIF saved. Add motion to a line or a shape (Motion, in its bar) to make it move.",
      tone: "info",
    });
  } catch {
    useDocStore.getState().showNotice({ message: "Couldn't make a GIF of this diagram.", tone: "warn" });
  }
}

export function exportPptx(): void {
  useDocStore.getState().openPptxDialog();
}

// No dialog: unlike the PowerPoint export there is nothing to choose, and the document carries its
// own .nedito copy so nothing is lost by exporting.
export async function exportDocxFile(): Promise<void> {
  const store = useDocStore.getState();
  try {
    const result = await exportDocx(store.doc);
    downloadBlob(result.blob, toFilename(store.doc.meta.title, ".docx"));
    store.noteExport();
    store.showNotice({
      message: `Exported ${result.figureCount} ${result.figureCount === 1 ? "figure" : "figures"}. The Word file carries the whole diagram inside it, so it can be opened here again.`,
      tone: "info",
    });
  } catch {
    store.showNotice({ message: "Couldn't build the Word file for this diagram.", tone: "warn" });
  }
}

// Phase 3.2: the headline "paste it anywhere and it's still clickable" action. The image is copied
// even when the document is too large for a link, so a big diagram loses only the link.
export async function copyImageLink(): Promise<void> {
  const { s, diagram } = current();
  const outcome = await copyImageWithLiveLink(s.doc, diagram);
  if (!outcome.ok) {
    // The link still exists even when the clipboard refused it, so hand it over.
    s.showNotice({ message: outcome.error ?? "Couldn't copy the image.", tone: "warn", url: outcome.url });
    return;
  }
  if (outcome.level === "too-large") {
    s.showNotice({
      message: "Image copied — but this diagram is too big to travel inside a link, so the pasted image won't be clickable.",
      tone: "warn",
      action: "download-doc",
    });
    return;
  }
  s.showNotice({ message: "Image copied with a live link. Paste it into any document — clicking it opens the full diagram.", tone: "info" });
}

export function share(): void {
  useDocStore.getState().openShareDialog();
}

export async function print(): Promise<void> {
  const { s, diagram } = current();
  await printDiagram(diagram, diagram.pageSize, s.doc.diagrams, s.doc.assets);
}

// ---------------------------------------------------------------------------- export formats

export type ExportFormatId = "pptx" | "docx" | "png" | "gif" | "editable-png" | "svg" | "pdf" | "document";

export interface ExportFormat {
  id: ExportFormatId;
  /** What the menu calls it. */
  label: string;
  /** The extension it writes, shown beside the label. */
  ext: string;
  /** What the Export button says when this was the last one used. */
  short: string;
  testId: string;
  run: () => void | Promise<void>;
}

/** Every format the Export menu offers, in its order: the shareable documents first. */
export const EXPORT_FORMATS: ExportFormat[] = [
  { id: "pptx", label: "PowerPoint", ext: ".pptx", short: "PowerPoint", testId: "nd-export-pptx", run: exportPptx },
  { id: "docx", label: "Word", ext: ".docx", short: "Word", testId: "nd-export-docx", run: exportDocxFile },
  { id: "png", label: "Image", ext: ".png", short: "PNG", testId: "nd-export-png", run: exportPng },
  { id: "gif", label: "Animated image", ext: ".gif", short: "GIF", testId: "nd-export-gif", run: exportGif },
  { id: "editable-png", label: "Editable image", ext: EDITABLE_PNG_EXT, short: "editable PNG", testId: "nd-export-editable-png", run: exportEditablePng },
  { id: "svg", label: "Vector", ext: ".svg", short: "SVG", testId: "nd-export-svg", run: exportSvg },
  { id: "pdf", label: "PDF", ext: ".pdf", short: "PDF", testId: "nd-export-pdf", run: exportPdf },
  { id: "document", label: `${BRAND.name} file`, ext: BRAND.fileExt, short: `${BRAND.name} file`, testId: "nd-export-document", run: saveCopy },
];

const LAST_EXPORT_KEY = `${BRAND.storagePrefix}:lastExport`;
const DEFAULT_EXPORT: ExportFormatId = "png";
/** Export ids stored before the rename (D100), which named the product, and what they are now. */
const RENAMED_EXPORT_IDS: Record<string, ExportFormatId> = { "deepdraw-png": "editable-png", deepdraw: "document" };

/** The format the Export button repeats: the last one used in this browser, PNG until then. */
export function readLastExport(): ExportFormat {
  let id: string | null = null;
  try {
    id = localStorage.getItem(LAST_EXPORT_KEY);
  } catch {
    // storage blocked: fall back to the default
  }
  if (id && id in RENAMED_EXPORT_IDS) id = RENAMED_EXPORT_IDS[id];
  return EXPORT_FORMATS.find((f) => f.id === id) ?? EXPORT_FORMATS.find((f) => f.id === DEFAULT_EXPORT)!;
}

export function writeLastExport(id: ExportFormatId): void {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, id);
  } catch {
    // best-effort, as everywhere else this app uses storage
  }
}

/** Runs an export and remembers it as the one the Export button repeats. */
export async function runExport(format: ExportFormat): Promise<void> {
  writeLastExport(format.id);
  await format.run();
}
