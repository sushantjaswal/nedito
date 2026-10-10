import { describe, expect, it } from "vitest";
import { breadcrumbText, fitToSlide, nodeRectInImage, nodeRectOnSlide, planSlides } from "./layout";
import { FIRST_SLIDE_ID, SLIDE_H_EMU, SLIDE_W_EMU, px } from "./ooxml";
import type { DiagramDocument, Diagram } from "../../model/types";

function nested(id: string, childDiagramId: string, z = 1) {
  return {
    id,
    type: "nested" as const,
    childDiagramId,
    position: { x: 0, y: 0 },
    size: { w: 200, h: 120 },
    z,
    style: {},
    collapsed: { icons: [] },
    ports: [],
  };
}

function diagram(id: string, title: string, nodes: Diagram["nodes"] = []): Diagram {
  return { id, title, nodes, edges: [] };
}

/** Main ▸ (Payments ▸ Fraud), Other — three levels plus a second page. */
function treeDoc(): DiagramDocument {
  return {
    formatVersion: 2,
    meta: { title: "t", created: "", modified: "", appVersion: "0" },
    rootDiagramIds: ["main", "page2"],
    diagrams: {
      main: diagram("main", "Main", [nested("n1", "payments")]),
      payments: diagram("payments", "Payments", [nested("n2", "fraud")]),
      fraud: diagram("fraud", "Fraud"),
      page2: diagram("page2", "Other"),
    },
  };
}

describe("planSlides", () => {
  it("orders depth-first: a parent immediately followed by its children", () => {
    expect(planSlides(treeDoc()).map((p) => p.title)).toEqual(["Main", "Payments", "Fraud", "Other"]);
  });

  // The zoom's sldId attribute points at these, so the numbering is load-bearing.
  it("numbers slides from 1 and slide ids from PowerPoint's floor of 256", () => {
    const plans = planSlides(treeDoc());
    expect(plans.map((p) => p.slideNumber)).toEqual([1, 2, 3, 4]);
    expect(plans.map((p) => p.slideId)).toEqual([
      FIRST_SLIDE_ID,
      FIRST_SLIDE_ID + 1,
      FIRST_SLIDE_ID + 2,
      FIRST_SLIDE_ID + 3,
    ]);
  });

  it("carries the breadcrumb path down the tree", () => {
    const fraud = planSlides(treeDoc()).find((p) => p.title === "Fraud")!;
    expect(fraud.path).toEqual(["Main", "Payments", "Fraud"]);
    expect(breadcrumbText(fraud.path)).toBe("Main › Payments › Fraud");
  });

  it("gives a diagram reached twice a single slide, not two", () => {
    const doc = treeDoc();
    doc.diagrams.main.nodes.push(nested("n3", "payments", 2));
    const plans = planSlides(doc);
    expect(plans.filter((p) => p.diagramId === "payments")).toHaveLength(1);
  });

  it("ignores a nested node pointing at a diagram that isn't there", () => {
    const doc = treeDoc();
    doc.diagrams.page2.nodes.push(nested("n9", "missing"));
    expect(planSlides(doc).map((p) => p.title)).toEqual(["Main", "Payments", "Fraud", "Other"]);
  });
});

describe("fitToSlide", () => {
  it("letterboxes a tall diagram rather than cropping it", () => {
    const fitted = fitToSlide(400, 800);
    expect(fitted.height).toBe(SLIDE_H_EMU);
    expect(fitted.width).toBeLessThan(SLIDE_W_EMU);
    // Centred, so the margins match.
    expect(fitted.offsetX).toBe(Math.round((SLIDE_W_EMU - fitted.width) / 2));
    expect(fitted.offsetY).toBe(0);
  });

  it("pillarboxes a wide diagram the same way", () => {
    const fitted = fitToSlide(4000, 500);
    expect(fitted.width).toBe(SLIDE_W_EMU);
    expect(fitted.height).toBeLessThan(SLIDE_H_EMU);
    expect(fitted.offsetX).toBe(0);
  });

  it("never scales past the slide, however small the diagram", () => {
    const fitted = fitToSlide(10, 10);
    expect(fitted.width).toBeLessThanOrEqual(SLIDE_W_EMU);
    expect(fitted.height).toBeLessThanOrEqual(SLIDE_H_EMU);
  });

  it("survives a degenerate empty diagram instead of dividing by zero", () => {
    const fitted = fitToSlide(0, 0);
    expect(Number.isFinite(fitted.scale)).toBe(true);
    expect(fitted.width).toBeGreaterThan(0);
  });
});

describe("nodeRectOnSlide", () => {
  const node = { position: { x: 100, y: 50 }, size: { w: 200, h: 120 } };

  it("places a node inside the fitted picture, not against the slide edge", () => {
    const fitted = fitToSlide(1000, 500);
    const rect = nodeRectOnSlide(node, { offsetX: 20, offsetY: 20 }, fitted);

    expect(rect.x).toBe(Math.round(fitted.offsetX + px(120) * fitted.scale));
    expect(rect.y).toBe(Math.round(fitted.offsetY + px(70) * fitted.scale));
    expect(rect.w).toBe(Math.round(px(200) * fitted.scale));
  });

  // The zoom sits over the box it represents; drifting even slightly reads as a misaligned deck.
  it("keeps the node inside the picture's own bounds", () => {
    const fitted = fitToSlide(1000, 500);
    const rect = nodeRectOnSlide(node, { offsetX: 20, offsetY: 20 }, fitted);
    expect(rect.x).toBeGreaterThanOrEqual(fitted.offsetX);
    expect(rect.x + rect.w).toBeLessThanOrEqual(fitted.offsetX + fitted.width);
    expect(rect.y + rect.h).toBeLessThanOrEqual(fitted.offsetY + fitted.height);
  });
});

describe("nodeRectInImage", () => {
  it("maps a node to device pixels at the render scale, for cropping its cover", () => {
    const rect = nodeRectInImage({ position: { x: 100, y: 50 }, size: { w: 200, h: 120 } }, { offsetX: 20, offsetY: 20 }, 2);
    expect(rect).toEqual({ x: 240, y: 140, w: 400, h: 240 });
  });

  it("never produces a zero-sized crop, which canvas rejects", () => {
    const rect = nodeRectInImage({ position: { x: 0, y: 0 }, size: { w: 0, h: 0 } }, { offsetX: 0, offsetY: 0 }, 2);
    expect(rect.w).toBeGreaterThan(0);
    expect(rect.h).toBeGreaterThan(0);
  });
});
