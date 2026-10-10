// Images of the user's own, and the document-level table that holds their pixels.
//
// An image is an ordinary ShapeNode whose shapeRef is IMAGE_SHAPE_REF and whose imageId names an
// entry in DiagramDocument.assets — so selecting, resizing, labels, layers, groups, edges and
// copy/paste all treat it as the shape it is, and only drawing differs.
// The pixels live once, in the table: a picture shown five times is stored once, and undo
// history shares one asset object instead of copying megabytes per step.
//
// An asset is never removed when its node is deleted — undo must be able to bring the node back
// with its picture. Unreferenced assets are dropped when the document is encoded, so none ever
// reaches a file.
import { nanoid } from "nanoid";
import { addNode, updateNodes } from "./actions";
import type { DiagramDocument, DNode, ImageAsset, ShapeNode } from "./types";

export const IMAGE_SHAPE_REF = "image";

export const IMAGE_MIMES: readonly ImageAsset["mime"][] = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

export function isImageNode(node: DNode): node is ShapeNode & { imageId: string } {
  return node.type === "shape" && node.shapeRef === IMAGE_SHAPE_REF;
}

/** The `data:` URL a renderer draws an asset from. */
export function assetDataUrl(asset: ImageAsset): string {
  return `data:${asset.mime};base64,${asset.data}`;
}

/** Every asset id some image node in the document shows. */
export function referencedAssetIds(doc: Pick<DiagramDocument, "diagrams">): Set<string> {
  const ids = new Set<string>();
  for (const diagram of Object.values(doc.diagrams)) {
    for (const node of diagram.nodes) if (isImageNode(node) && node.imageId) ids.add(node.imageId);
  }
  return ids;
}

/**
 * Only the assets some node shows, sorted by id for a stable file; undefined when there are none,
 * so a document without images carries no `assets` key at all.
 */
export function prunedAssets(doc: DiagramDocument): Record<string, ImageAsset> | undefined {
  if (!doc.assets) return undefined;
  const used = referencedAssetIds(doc);
  const kept: Record<string, ImageAsset> = {};
  for (const id of Object.keys(doc.assets).sort()) if (used.has(id)) kept[id] = doc.assets[id];
  return Object.keys(kept).length ? kept : undefined;
}

/**
 * The size a newly placed image takes on the canvas: its own pixels, scaled down so the long edge
 * is at most `maxEdge`. A 2,048 px photo at full size would bury the diagram it was added to.
 */
export function imageDisplaySize(asset: Pick<ImageAsset, "width" | "height">, maxEdge = 320): { w: number; h: number } {
  const scale = Math.min(1, maxEdge / Math.max(asset.width, asset.height));
  return { w: Math.max(20, Math.round(asset.width * scale)), h: Math.max(20, Math.round(asset.height * scale)) };
}

/** Space between images placed in one go, so several dropped at once don't pile up. */
const STAGGER = 24;

/**
 * Adds pictures to a diagram in one step (one undo entry): each asset into the table, and an image
 * node for it centred on `center`, later ones staggered down and right. Returns the new node ids.
 */
export function insertImages(
  doc: DiagramDocument,
  diagramId: string,
  assets: ImageAsset[],
  center: { x: number; y: number },
  layerId?: string,
): { doc: DiagramDocument; nodeIds: string[] } {
  let next: DiagramDocument = { ...doc, assets: { ...doc.assets } };
  const nodeIds: string[] = [];
  assets.forEach((asset, i) => {
    const assetId = nanoid();
    next.assets![assetId] = asset;
    const size = imageDisplaySize(asset);
    const id = nanoid();
    const node: Omit<ShapeNode, "z"> = {
      id,
      type: "shape",
      shapeRef: IMAGE_SHAPE_REF,
      imageId: assetId,
      position: { x: Math.round(center.x - size.w / 2 + i * STAGGER), y: Math.round(center.y - size.h / 2 + i * STAGGER) },
      size,
      style: {},
      ...(layerId ? { layerId } : {}),
    };
    next = addNode(next, diagramId, node);
    nodeIds.push(id);
  });
  return { doc: next, nodeIds };
}

/**
 * Swaps an image node's picture, keeping its place, size, style, label and connections. The old
 * asset is left for undo and pruned on save if nothing else shows it.
 */
export function replaceImage(doc: DiagramDocument, diagramId: string, nodeId: string, asset: ImageAsset): DiagramDocument {
  const assetId = nanoid();
  const diagram = doc.diagrams[diagramId];
  if (!diagram?.nodes.some((n) => n.id === nodeId && isImageNode(n))) return doc;
  return {
    ...doc,
    assets: { ...doc.assets, [assetId]: asset },
    diagrams: {
      ...doc.diagrams,
      [diagramId]: {
        ...diagram,
        nodes: diagram.nodes.map((n) => (n.id === nodeId ? ({ ...n, imageId: assetId } as DNode) : n)),
      },
    },
  };
}

/**
 * Restores an image node to its picture's own proportions at the default placed size, keeping its
 * centre where it was — the way back after a Shift-stretched resize.
 */
export function resetImageSize(doc: DiagramDocument, diagramId: string, nodeId: string): DiagramDocument {
  const node = doc.diagrams[diagramId]?.nodes.find((n) => n.id === nodeId);
  if (!node || !isImageNode(node)) return doc;
  const asset = doc.assets?.[node.imageId];
  if (!asset) return doc;
  const size = imageDisplaySize(asset);
  const cx = node.position.x + node.size.w / 2;
  const cy = node.position.y + node.size.h / 2;
  return updateNodes(doc, diagramId, [
    { id: nodeId, patch: { size, position: { x: Math.round(cx - size.w / 2), y: Math.round(cy - size.h / 2) } } },
  ]);
}

/** The leading bytes each accepted format must start with. SVG is text, checked separately. */
const SIGNATURES: Partial<Record<ImageAsset["mime"], number[][]>> = {
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/gif": [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  ],
  // "RIFF" …4 size bytes… "WEBP": checked as two parts below.
  "image/webp": [[0x52, 0x49, 0x46, 0x46]],
};

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function leadingBytes(base64: string, count: number): number[] {
  // Enough base64 characters for `count` bytes; atob throws on anything malformed.
  const chunk = base64.slice(0, Math.ceil(count / 3) * 4);
  return Array.from(atob(chunk), (c) => c.charCodeAt(0)).slice(0, count);
}

/**
 * Why an asset cannot be trusted, or null when it is sound: an allowed type, well-formed base64,
 * bytes that really are that type, and a positive size. A file is data from anywhere; an asset
 * that claims to be a PNG and is not would otherwise reach every renderer.
 */
export function assetProblem(asset: ImageAsset): string | null {
  if (!IMAGE_MIMES.includes(asset.mime)) return `unsupported image type "${String(asset.mime)}"`;
  if (typeof asset.data !== "string" || asset.data.length === 0 || asset.data.length % 4 !== 0 || !BASE64.test(asset.data)) {
    return "image data is not valid base64";
  }
  if (!(asset.width > 0) || !(asset.height > 0)) return "image has no size";
  let head: number[];
  try {
    head = leadingBytes(asset.data, 16);
  } catch {
    return "image data is not valid base64";
  }
  if (asset.mime === "image/svg+xml") {
    const bytes = head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf ? head.slice(3) : head; // UTF-8 BOM
    const text = String.fromCharCode(...bytes).trimStart();
    return text.startsWith("<") ? null : "image data is not SVG";
  }
  const starts = (sig: number[]) => sig.every((b, i) => head[i] === b);
  if (!SIGNATURES[asset.mime]!.some(starts)) return `image data is not ${asset.mime.slice(6).toUpperCase()}`;
  if (asset.mime === "image/webp" && String.fromCharCode(...head.slice(8, 12)) !== "WEBP") return "image data is not WEBP";
  return null;
}
