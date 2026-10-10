// Minimal, dependency-free PDF writer for a single full-page image.
//
// Same reasoning as pngChunks.ts and svgExport.ts before it: the one thing we need from PDF is
// "one page, one image", which is a couple of hundred bytes of object boilerplate — far less
// than the ~350KB a PDF library would add to the bundle for features this app doesn't use
// (a new dependency needs a reason, and this one didn't have one).
//
// Deliberately pure: the caller supplies image bytes that are *already* zlib-compressed, so
// this module has no dependency on CompressionStream/canvas and can be unit-tested under jsdom.
// See pdfExport.ts for the browser half.

export interface SingleImagePdfOptions {
  /** zlib-compressed (RFC 1950) 8-bit RGB samples, row-major, no padding. */
  imageData: Uint8Array;
  imageWidth: number;
  imageHeight: number;
  /** Page box in PDF points (72/inch). */
  pageWidthPt: number;
  pageHeightPt: number;
  title?: string;
}

const encoder = new TextEncoder();

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

// PDF strings escape backslash and both parentheses; everything else can go through as-is for
// the ASCII subset we put in /Title.
function pdfString(text: string): string {
  return `(${text.replace(/([\\()])/g, "\\$1").replace(/[^\x20-\x7e]/g, "")})`;
}

export function buildSingleImagePdf(options: SingleImagePdfOptions): Uint8Array {
  const { imageData, imageWidth, imageHeight, pageWidthPt, pageHeightPt } = options;
  const w = pageWidthPt.toFixed(2);
  const h = pageHeightPt.toFixed(2);

  // "q ... Q" brackets the graphics state; the cm matrix scales the 1x1 image space up to the
  // full page box, so the raster lands exactly on the MediaBox.
  const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBytes = encoder.encode(content);

  const objects: Uint8Array[] = [
    encoder.encode("<< /Type /Catalog /Pages 2 0 R >>"),
    encoder.encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    encoder.encode(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
        `/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
    ),
    concat([encoder.encode(`<< /Length ${contentBytes.length} >>\nstream\n`), contentBytes, encoder.encode("\nendstream")]),
    concat([
      encoder.encode(
        `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${imageData.length} >>\nstream\n`,
      ),
      imageData,
      encoder.encode("\nendstream"),
    ]),
    encoder.encode(`<< /Title ${pdfString(options.title ?? "Diagram")} /Producer ${pdfString("Nedito")} >>`),
  ];

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };

  // %âãÏÓ on line 2 is the conventional binary marker telling tools this file isn't plain text.
  push(encoder.encode("%PDF-1.4\n"));
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const xref: number[] = [];
  objects.forEach((body, i) => {
    xref.push(offset);
    push(encoder.encode(`${i + 1} 0 obj\n`));
    push(body);
    push(encoder.encode("\nendobj\n"));
  });

  // The xref table is byte-offset addressed, which is why every chunk above is accounted for
  // rather than being assembled as a string at the end.
  const xrefStart = offset;
  const lines = [`xref`, `0 ${objects.length + 1}`, `0000000000 65535 f `];
  for (const at of xref) lines.push(`${String(at).padStart(10, "0")} 00000 n `);
  push(encoder.encode(lines.join("\n") + "\n"));
  push(
    encoder.encode(
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n` +
        `startxref\n${xrefStart}\n%%EOF\n`,
    ),
  );

  return concat(chunks);
}
