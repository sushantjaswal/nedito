// IBM Plex Sans, embedded into exported SVG as base64 @font-face.
//
// An export is read on machines that don't have IBM Plex installed — that was the stated reason
// svgExport kept its own "Segoe UI, system-ui, sans-serif" stack and was exempted from
// fontTokens.test.ts. The result was worse than the problem: node labels came out in whatever
// the viewer had, and edge labels, which named no family at all, fell back to serif. Embedding
// the face removes the reason for the exemption entirely.
//
// Only the two weights labels can actually use are embedded (RichLabel.bold picks 400 or 700),
// from the latin subsets the app already ships — about 45 KB of woff2, ~60 KB once base64'd.
// They are loaded on demand rather than imported at module scope, so nobody who never exports
// pays for them in the main bundle.

/** The family name exported SVG asks for. Must match the @font-face below and tokens.css. */
export const EXPORT_FONT_FAMILY = "IBM Plex Sans";

/**
 * What an export falls back to if the embedded face fails to load — a viewer that strips
 * @font-face, or a rasteriser that gives up on the data URI. Named here, once, rather than
 * written into the markup at each `<text>`.
 */
export const EXPORT_FONT_STACK = `${EXPORT_FONT_FAMILY}, system-ui, sans-serif`;

let cached: string | null = null;

async function toBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  // Chunked: String.fromCharCode(...bytes) blows the argument limit on a 25 KB font.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * The `<style>` contents to drop into an exported SVG's `<defs>`.
 *
 * Returns an empty string if the fonts can't be read, so an export never fails over a typeface:
 * the SVG still carries the family name and the viewer falls back. Cached for the session —
 * exporting eight slides shouldn't fetch the same font eight times.
 */
export async function loadExportFontCss(): Promise<string> {
  if (cached !== null) return cached;
  try {
    const [regular, bold] = await Promise.all([
      import("@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2?url").then((m) => toBase64(m.default)),
      import("@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2?url").then((m) => toBase64(m.default)),
    ]);
    cached = [400, 700]
      .map(
        (weight, i) =>
          `@font-face{font-family:"${EXPORT_FONT_FAMILY}";font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${i === 0 ? regular : bold}) format("woff2");}`,
      )
      .join("");
  } catch {
    cached = "";
  }
  return cached;
}

/** Test seam: forget the cached CSS. */
export function resetExportFontCache(): void {
  cached = null;
}
