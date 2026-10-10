import { describe, expect, it } from "vitest";
import { ARROWHEADS, ARROWHEAD_OPTIONS, markerDefs, markerDomId, markerUrl } from "./arrowheads";

// Three consumers have to agree on this vocabulary: the canvas, the SVG export and the Style
// panel. They used to be three separate literal lists, which is exactly how an arrowhead gets
// half-added — drawn on screen, missing from an export, absent from the dropdown.

describe("the arrowhead table", () => {
  it("gives every kind a unique id and a label", () => {
    const ids = ARROWHEADS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ARROWHEADS) expect(a.label.trim().length).toBeGreaterThan(0);
  });

  it("carries the UML heads the templates need", () => {
    const ids = ARROWHEADS.map((a) => a.id);
    // Generalization, composition, aggregation — none expressible as "open" or "classic".
    expect(ids).toContain("triangle");
    expect(ids).toContain("diamond");
    expect(ids).toContain("diamond-open");
  });

  it("carries the crow's-foot cardinality marks the ER templates need", () => {
    const ids = ARROWHEADS.map((a) => a.id);
    for (const id of ["crows-foot", "er-one", "er-zero-or-one", "er-one-or-many", "er-zero-or-many"]) {
      expect(ids).toContain(id);
    }
  });

  it("gives every head at least one part to draw", () => {
    for (const a of ARROWHEADS) expect(a.parts.length).toBeGreaterThan(0);
  });

  it("offers exactly the table plus None in the Style panel", () => {
    expect(ARROWHEAD_OPTIONS.map((o) => o.id)).toEqual(["none", ...ARROWHEADS.map((a) => a.id)]);
  });
});

describe("markerUrl", () => {
  it("resolves every kind in the table", () => {
    for (const a of ARROWHEADS) expect(markerUrl(a.id)).toBe(`url(#${markerDomId(a.id)})`);
  });

  it("returns nothing for none, and for anything it does not know", () => {
    expect(markerUrl("none")).toBeUndefined();
    expect(markerUrl("no-such-arrowhead")).toBeUndefined();
    expect(markerUrl(undefined)).toBeUndefined();
    expect(markerUrl(42)).toBeUndefined();
  });
});

describe("markerDefs", () => {
  it("defines a marker for every kind the table lists", () => {
    const defs = markerDefs();
    for (const a of ARROWHEADS) expect(defs).toContain(`id="${markerDomId(a.id)}"`);
  });

  it("is well-formed SVG", () => {
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg"><defs>${markerDefs()}</defs></svg>`, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.getElementsByTagName("marker")).toHaveLength(ARROWHEADS.length);
  });

  // A literal colour here would paint every arrowhead the same whatever its edge, which is why
  // a red edge used to export with a black head.
  it("takes each head's colour from the edge it terminates", () => {
    expect(markerDefs()).toContain("context-stroke");
    expect(markerDefs()).not.toContain('fill="#1E2733"');
  });

  // UML's hollow heads are opaque, not transparent: the line would otherwise show through.
  it("fills the hollow triangle and diamond with the page, not with nothing", () => {
    const defs = markerDefs("#FFFFFF");
    const triangle = defs.slice(defs.indexOf('id="nd-arrow-triangle"'));
    expect(triangle.slice(0, triangle.indexOf("</marker>"))).toContain('fill="#FFFFFF"');

    const open = defs.slice(defs.indexOf('id="nd-arrow-open"'));
    expect(open.slice(0, open.indexOf("</marker>"))).toContain('fill="none"');
  });

  // "Zero or many" is the case that forced parts[]: a stroked fork the line runs into, plus an
  // opaque ring the line must not show through. One path with one paint cannot say that.
  it("paints a composite head's parts differently within the same marker", () => {
    const defs = markerDefs("#FFFFFF");
    const marker = defs.slice(defs.indexOf('id="nd-arrow-er-zero-or-many"'));
    const body = marker.slice(0, marker.indexOf("</marker>"));
    expect(body.match(/<path /g)).toHaveLength(2);
    expect(body).toContain('fill="none"');
    expect(body).toContain('fill="#FFFFFF"');
  });

  it("lets the caller name the page colour", () => {
    expect(markerDefs("#101010")).toContain('fill="#101010"');
  });
});
