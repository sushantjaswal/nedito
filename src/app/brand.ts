// Single source of truth for product identity, so a rename touches this one file.
// Never hardcode the product name, file extension, format id, storage prefix or host outside this
// file.
//
// Renamed from DeepDraw to Nedito (short for Nested Diagram Tool) on 2026-10-06:
// another live product, deepdraw.app, writes .deepdraw.json, .deepdraw.html and .deepdraw.png
// files, so ours had to stop sharing its name and extensions. Everything the app ever wrote under
// an earlier identity is listed in LEGACY_BRANDS and keeps working forever: old files open, old
// share links decode, old browser storage is migrated (app/storageMigration.ts), and the old host
// redirects here (app/originGuard.ts).
export interface Brand {
  name: string;
  /** What the name stands for: under it on the startup screen, beside it in the app bar. */
  tagline: string;
  fileExt: string;
  formatId: string;
  storagePrefix: string;
  /** The one host the app is served from and every link it hands out points at. */
  host: string;
  /** Where people write to us (About, N8). */
  contact: string;
  /**
   * The public source repository (About). The one place its URL is written: it carries the
   * owner's GitHub handle, so the repository's no-personal-details rule, enforced by
   * src/app/personalData.test.ts, allows it here and nowhere else.
   */
  repository: string;
}

export const BRAND: Brand = {
  name: "Nedito",
  tagline: "Nested Diagram Tool",
  fileExt: ".nedito",
  formatId: "nedito",
  storagePrefix: "nedito",
  host: "nedito.app",
  contact: "hello@nedito.app",
  repository: "https://github.com/sushantjaswal/nedito",
};

/** `https://` + the canonical host: where share links and live-linked images point. */
export const APP_ORIGIN = `https://${BRAND.host}`;

/** The editable-image extension: a PNG that is also the document. */
export const EDITABLE_PNG_EXT = `${BRAND.fileExt}.png`;

/**
 * Every identity the app has had before this one, newest first. Read forever, never written:
 * files with these extensions and format ids still open, and storage under these prefixes is
 * migrated once. Old hosts are not kept: DeepDraw's myconifer.app is no longer served (D106).
 */
export type LegacyBrand = Omit<Brand, "host" | "tagline" | "contact" | "repository">;

export const LEGACY_BRANDS: readonly LegacyBrand[] = [
  { name: "DeepDraw", fileExt: ".deepdraw", formatId: "deepdraw", storagePrefix: "deepdraw" },
];

/** Hosts that serve the same build but are not the canonical one: they redirect to BRAND.host. */
export const ALIAS_HOSTS: readonly string[] = [`www.${BRAND.host}`];

/** Every document extension the app opens: the current one first, then each earlier one. */
export const OPENABLE_DOC_EXTS: readonly string[] = [BRAND.fileExt, ...LEGACY_BRANDS.map((b) => b.fileExt)];

/** Every editable-image extension the app opens. */
export const OPENABLE_PNG_EXTS: readonly string[] = OPENABLE_DOC_EXTS.map((ext) => `${ext}.png`);
