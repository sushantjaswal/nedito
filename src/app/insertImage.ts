// The one path every way of adding a picture goes through — Arrange ▸ Insert image…, the canvas
// menu, dropping files, pasting from the system clipboard and Replace image… (CLAUDE_HISTORY.md
// D79). Each reads its files through file/imageImport.ts and reports the outcome the same way:
// what was resized or flattened, and what was refused and why.
import { viewCenter } from "../canvas/canvasApi";
import { importImageFile } from "../file/imageImport";
import { useDocStore } from "../model/store";
import type { ImageAsset } from "../model/types";

/** What the file picker offers. The bytes are still checked: this is only a filter. */
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,.svg";

/** Reads files into assets, and says in one notice what happened to the ones that needed saying. */
export async function readImages(files: File[]): Promise<ImageAsset[]> {
  const assets: ImageAsset[] = [];
  const said: string[] = [];
  let refused = false;
  for (const file of files) {
    const result = await importImageFile(file);
    if (result.ok) {
      assets.push(result.asset);
      if (result.notice) said.push(result.notice);
    } else {
      refused = true;
      said.push(result.error);
    }
  }
  if (said.length) {
    useDocStore.getState().showNotice({ message: said.join(" "), tone: refused ? "warn" : "info" });
  }
  return assets;
}

/** Places pictures at a diagram point (the view's centre unless given), selected, in one undo step. */
export async function insertImageFiles(files: File[], at?: { x: number; y: number }): Promise<string[]> {
  if (useDocStore.getState().ui.viewerMode || files.length === 0) return [];
  const assets = await readImages(files);
  return useDocStore.getState().insertImages(assets, at ?? viewCenter());
}

/** Opens the system file picker for images; resolves with the chosen files (none if cancelled). */
export function pickImageFiles(multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = IMAGE_ACCEPT;
    input.multiple = multiple;
    input.addEventListener("change", () => resolve(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

/** Arrange ▸ Insert image…: pick one or more pictures and place them at the view's centre. */
export async function chooseAndInsertImages(): Promise<void> {
  const files = await pickImageFiles(true);
  await insertImageFiles(files);
}

/** Replace image…: pick one picture and swap it into an existing image node. */
export async function chooseAndReplaceImage(nodeId: string): Promise<void> {
  const [file] = await pickImageFiles(false);
  if (!file) return;
  const [asset] = await readImages([file]);
  if (asset) useDocStore.getState().replaceImage(nodeId, asset);
}

/**
 * Paste from a menu (Edit ▸ Paste, the canvas menu): what Ctrl+V does, without a paste event. An
 * image on the system clipboard — copied in another app — is placed as a picture; otherwise the
 * shapes copied here are pasted. Reading the system clipboard needs the async Clipboard API and,
 * in some browsers, the user's permission the first time; if it is refused or unavailable, the
 * menu pastes the shapes copied here, exactly as it did before (D82).
 */
export async function pasteFromMenu(at?: { x: number; y: number }): Promise<void> {
  const store = useDocStore.getState();
  try {
    const items = (await navigator.clipboard?.read?.()) ?? [];
    const files: File[] = [];
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (!type) continue;
      const blob = await item.getType(type);
      files.push(new File([blob], `pasted.${type.split("/")[1].replace("svg+xml", "svg")}`, { type }));
    }
    if (files.length > 0) {
      await insertImageFiles(files, at);
      return;
    }
  } catch {
    // No permission, no Clipboard API, or nothing readable: the shapes copied here, as before.
  }
  store.pasteClipboard();
}

/** Image files in a DataTransfer or clipboard, in order; anything else is ignored. */
export function imageFilesIn(list: FileList | DataTransferItemList | null | undefined): File[] {
  if (!list) return [];
  const files: File[] = [];
  for (const entry of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const file = entry instanceof File ? entry : entry.kind === "file" ? entry.getAsFile() : null;
    if (file && (file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name))) files.push(file);
  }
  return files;
}
