// The one escaping helper for markup the app builds as a string: the Nested Block miniature, the
// stencil glyphs, the SVG export. Document values reach that markup, and a document may come from
// anyone, so every value written into an attribute or text goes through here — including values
// validation has already checked, so that neither defence depends on the other.
//
// Escapes the five characters that can end an attribute or start markup. Numbers and other values
// are turned into text first, so a value that should have been a number and was not still cannot
// change the markup around it.
export function escapeMarkup(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
