import markSvg from "./brand-mark.svg?raw";
import styles from "./BrandMark.module.css";

// The mark (D101): the app icon's frame and inner block without its violet tile, drawn in
// `currentColor`, for anywhere it sits on a coloured surface — the app bar, the viewer's strip —
// so it always takes that surface's text colour and stays legible in either theme.
//
// Inlined rather than referenced as an image, because an <img> cannot inherit currentColor. The
// file's provenance metadata stays in the file and is left out of the page.
// Only the root <svg> loses its fixed size and its own label (CSS sizes it; the name beside it is
// the label) — the shapes inside keep every attribute.
const INLINE = markSvg
  .replace(/<metadata>[\s\S]*?<\/metadata>/, "")
  .replace(/<svg\b[^>]*>/, (root) =>
    root.replace(/\s(width|height)="\d+"/g, "").replace(/\srole="img"/, "").replace(/\saria-label="[^"]*"/, ""),
  );

/** Decorative: the product's name always sits beside it, so it is hidden from assistive tech. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={className ? `${styles.mark} ${className}` : styles.mark}
      aria-hidden="true"
      data-testid="nd-brand-mark"
      // eslint-disable-next-line no-restricted-syntax -- the brand mark, a constant from the repository
      dangerouslySetInnerHTML={{ __html: INLINE }}
    />
  );
}
